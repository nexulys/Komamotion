-- KomaMotion AI — backfill public.users for auth accounts that predate the
-- on_auth_user_created trigger. Without a profile row, any project or
-- generation insert fails on its foreign key to public.users.
-- The app also self-heals on login (lib/supabase/queries.ts ensureUserProfile);
-- this just fixes existing accounts in one pass. Safe to re-run.

insert into public.users (id, email, display_name, avatar_url)
select
  au.id,
  coalesce(au.email, ''),
  coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name'),
  au.raw_user_meta_data ->> 'avatar_url'
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null
on conflict (id) do nothing;
