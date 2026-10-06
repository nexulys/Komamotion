-- KomaMotion AI — render persistence + atomic credit accounting
--
-- 1. Rendered videos are now mirrored from the provider CDN (fal.ai /
--    Replicate URLs expire after a few days) into the private
--    `rendered-videos` bucket at `${user_id}/${project_id}/${generation_id}.mp4`.
--    The bucket stays private: reads go through short-lived signed URLs
--    (see lib/supabase/signed-url.ts), the stored object is permanent.
-- 2. Credit balance changes go through row-locking RPCs instead of
--    read-in-JS-then-write, which let concurrent requests (double click,
--    parallel batch items, refund racing a debit) overwrite each other.

-- ============================================================
-- Storage: make sure the private render bucket + read policy exist
-- ============================================================
insert into storage.buckets (id, name, public)
values ('rendered-videos', 'rendered-videos', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can view own rendered videos" on storage.objects;
create policy "Users can view own rendered videos"
  on storage.objects for select
  using (bucket_id = 'rendered-videos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Credits: atomic debit / credit
-- ============================================================
create or replace function public.deduct_user_credits(p_user_id uuid, p_amount int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'deduct_user_credits: p_amount must be positive, got %', p_amount;
  end if;

  select credits_balance into v_balance from public.users where id = p_user_id for update;
  if v_balance is null or v_balance < p_amount then
    return false;
  end if;

  update public.users
    set credits_balance = credits_balance - p_amount, updated_at = now()
    where id = p_user_id;
  return true;
end;
$$;

-- Refunds and grants must be atomic too: a read-then-write refund racing a
-- debit would overwrite the debit and hand out free credits.
create or replace function public.add_user_credits(p_user_id uuid, p_amount int)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'add_user_credits: p_amount must be positive, got %', p_amount;
  end if;

  update public.users
    set credits_balance = credits_balance + p_amount, updated_at = now()
    where id = p_user_id
    returning credits_balance into v_balance;
  return v_balance;
end;
$$;

-- Both functions take an arbitrary user id and are SECURITY DEFINER, so
-- exposing them through PostgREST would let any signed-in user drain
-- someone else's balance or mint credits for themselves. Supabase grants
-- EXECUTE on new public functions to anon/authenticated by default, hence
-- the explicit revokes: only the server (service role) may call them.
revoke all on function public.deduct_user_credits(uuid, int) from public, anon, authenticated;
revoke all on function public.add_user_credits(uuid, int) from public, anon, authenticated;
grant execute on function public.deduct_user_credits(uuid, int) to service_role;
grant execute on function public.add_user_credits(uuid, int) to service_role;

-- Defense in depth: no code path can drive a balance below zero, even one
-- that bypasses the RPCs. NOT VALID skips checking pre-existing rows.
alter table public.users drop constraint if exists users_credits_balance_nonnegative;
alter table public.users add constraint users_credits_balance_nonnegative
  check (credits_balance >= 0) not valid;
