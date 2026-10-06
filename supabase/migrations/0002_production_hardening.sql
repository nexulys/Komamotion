-- KomaMotion AI — production hardening
-- Adds: free tier + admin flag, generation pipeline columns (progress,
-- inpainting, upscaling, audio, watermark, multi-ratio export, batching,
-- cost tracking), panel extraction + export tables, Realtime, and private
-- storage buckets with owner-scoped signed-URL access.

-- ============================================================
-- users: free tier + admin
-- ============================================================
alter table public.users
  add column if not exists is_admin boolean not null default false;

alter table public.users drop constraint if exists users_plan_check;
alter table public.users add constraint users_plan_check
  check (plan in ('free', 'starter', 'studio', 'pro'));

alter table public.users alter column plan set default 'free';
alter table public.users alter column credits_balance set default 20;

-- New signups land on the free tier with a small trial credit grant
-- (previously defaulted straight to 'starter' / 100 credits).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, avatar_url, plan, credits_balance)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    'free',
    20
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- generations: pipeline stages, cost tracking, batching
-- ============================================================
alter table public.generations
  add column if not exists progress smallint not null default 0
    check (progress >= 0 and progress <= 100),
  add column if not exists remove_text boolean not null default false,
  add column if not exists cleaned_image_url text,
  add column if not exists upscaled_video_url text,
  add column if not exists audio_url text,
  add column if not exists watermarked boolean not null default false,
  add column if not exists export_ratio text not null default '16:9',
  add column if not exists batch_id uuid,
  add column if not exists estimated_cost_usd numeric(10, 4);

alter table public.generations drop constraint if exists generations_export_ratio_check;
alter table public.generations add constraint generations_export_ratio_check
  check (export_ratio in ('16:9', '9:16', '1:1'));

create index if not exists generations_batch_id_idx on public.generations (batch_id);

comment on column public.generations.source_image_url is 'Path inside the private manga-sources bucket (resolved to a short-lived signed URL on read — see lib/supabase/signed-url.ts). No longer a public URL as of this migration.';
comment on column public.generations.progress is 'Live render progress (0-100), pushed via Supabase Realtime by the Trigger.dev pipeline.';
comment on column public.generations.remove_text is 'Run AI inpainting to remove speech bubbles/SFX text before animating.';
comment on column public.generations.estimated_cost_usd is 'Estimated real provider cost in USD, for admin margin reporting (credits charged vs. actual AI spend).';

-- ============================================================
-- generation_exports — multi-ratio render exports (16:9 / 9:16 / 1:1)
-- ============================================================
create table if not exists public.generation_exports (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  ratio text not null check (ratio in ('16:9', '9:16', '1:1')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  video_url text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists generation_exports_generation_id_idx on public.generation_exports (generation_id);
create unique index if not exists generation_exports_unique_ratio
  on public.generation_exports (generation_id, ratio);

alter table public.generation_exports enable row level security;

create policy "Users can view own generation exports" on public.generation_exports
  for select using (auth.uid() = user_id);
create policy "Users can request own generation exports" on public.generation_exports
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- panel_extractions — auto-split a full manga page into panels
-- ============================================================
create table if not exists public.panel_extractions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  source_page_url text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  panel_urls jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists panel_extractions_project_id_idx on public.panel_extractions (project_id);

alter table public.panel_extractions enable row level security;

create policy "Users can view own panel extractions" on public.panel_extractions
  for select using (auth.uid() = user_id);
create policy "Users can request own panel extractions" on public.panel_extractions
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- credit_transactions: admin-issued adjustments
-- ============================================================
alter table public.credit_transactions drop constraint if exists credit_transactions_type_check;
alter table public.credit_transactions add constraint credit_transactions_type_check
  check (type in (
    'subscription_grant', 'purchase', 'generation_debit', 'refund',
    'manual_adjustment', 'signup_bonus', 'admin_grant'
  ));

-- ============================================================
-- Realtime — let the editor subscribe to live progress/status
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'generations'
  ) then
    alter publication supabase_realtime add table public.generations;
  end if;
end $$;

-- ============================================================
-- Storage: switch to private buckets, owner-scoped access.
-- Upload paths are now `${userId}/${projectId}/${uuid}-${filename}`
-- so RLS can check the first path segment against auth.uid() without
-- a join. Providers (fal.ai/Replicate) fetch the source image via a
-- short-lived signed URL generated per submission, not a public link.
-- ============================================================
update storage.buckets set public = false where id in ('manga-sources', 'rendered-videos');

drop policy if exists "Authenticated users can upload manga sources" on storage.objects;
drop policy if exists "Anyone can view manga sources" on storage.objects;
drop policy if exists "Anyone can view rendered videos" on storage.objects;

create policy "Users can upload own manga sources"
  on storage.objects for insert
  with check (
    bucket_id = 'manga-sources'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view own manga sources"
  on storage.objects for select
  using (bucket_id = 'manga-sources' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own manga sources"
  on storage.objects for delete
  using (bucket_id = 'manga-sources' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view own rendered videos"
  on storage.objects for select
  using (bucket_id = 'rendered-videos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Rendered videos and exports are written server-side only (service role,
-- from Trigger.dev tasks / webhooks), so no client-facing insert policy
-- is needed on the 'rendered-videos' bucket.
