-- KomaMotion AI — Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- users — public profile mirror of auth.users
-- ============================================================
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  plan text not null default 'starter' check (plan in ('starter', 'studio', 'pro')),
  credits_balance integer not null default 100,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  stripe_subscription_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Public profile + billing state for each authenticated creator.';

-- Auto-create a public.users row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- projects — a manga animation project (gallery item)
-- ============================================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null default 'Untitled project',
  description text,
  cover_image_url text,
  status text not null default 'draft' check (status in ('draft', 'processing', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);

-- ============================================================
-- generations — one image-to-video render job
-- ============================================================
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  source_image_url text not null,
  output_video_url text,
  thumbnail_url text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  provider text not null default 'fal' check (provider in ('fal', 'replicate')),
  model text not null default 'ltx-video',
  prompt text,
  camera_movement text not null default 'static' check (
    camera_movement in ('static', 'pan_left', 'pan_right', 'zoom_in', 'zoom_out', 'dolly_in', 'orbit')
  ),
  motion_intensity numeric not null default 0.5 check (motion_intensity >= 0 and motion_intensity <= 1),
  fps integer not null default 24 check (fps in (12, 24, 30, 60)),
  resolution text not null default '1080p' check (resolution in ('1080p', '4k')),
  colorize boolean not null default false,
  duration_seconds numeric not null default 4,
  credits_cost integer not null default 0,
  external_job_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists generations_project_id_idx on public.generations (project_id);
create index if not exists generations_user_id_idx on public.generations (user_id);
create index if not exists generations_status_idx on public.generations (status);
create index if not exists generations_external_job_id_idx on public.generations (external_job_id);

-- ============================================================
-- credit_transactions — ledger of every credit movement
-- ============================================================
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount integer not null, -- positive = credit, negative = debit
  type text not null check (
    type in ('subscription_grant', 'purchase', 'generation_debit', 'refund', 'manual_adjustment', 'signup_bonus')
  ),
  description text,
  generation_id uuid references public.generations (id) on delete set null,
  stripe_event_id text,
  created_at timestamptz not null default now()
);

create index if not exists credit_transactions_user_id_idx on public.credit_transactions (user_id);
create unique index if not exists credit_transactions_stripe_event_id_idx
  on public.credit_transactions (stripe_event_id) where stripe_event_id is not null;

-- ============================================================
-- updated_at helpers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at before update on public.users
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at before update on public.projects
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_generations_updated_at on public.generations;
create trigger set_generations_updated_at before update on public.generations
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.generations enable row level security;
alter table public.credit_transactions enable row level security;

create policy "Users can view own profile" on public.users
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

create policy "Users can view own projects" on public.projects
  for select using (auth.uid() = user_id);
create policy "Users can insert own projects" on public.projects
  for insert with check (auth.uid() = user_id);
create policy "Users can update own projects" on public.projects
  for update using (auth.uid() = user_id);
create policy "Users can delete own projects" on public.projects
  for delete using (auth.uid() = user_id);

create policy "Users can view own generations" on public.generations
  for select using (auth.uid() = user_id);
create policy "Users can insert own generations" on public.generations
  for insert with check (auth.uid() = user_id);
create policy "Users can update own generations" on public.generations
  for update using (auth.uid() = user_id);

create policy "Users can view own credit transactions" on public.credit_transactions
  for select using (auth.uid() = user_id);

-- Note: service-role writes (webhooks, background jobs) bypass RLS by design
-- and are the only path allowed to update generation status/output or
-- insert credit_transactions rows other than the client-side debit at
-- generation-create time.

-- ============================================================
-- Storage buckets
-- ============================================================
insert into storage.buckets (id, name, public)
values ('manga-sources', 'manga-sources', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('rendered-videos', 'rendered-videos', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload manga sources"
  on storage.objects for insert
  with check (bucket_id = 'manga-sources' and auth.role() = 'authenticated');

create policy "Anyone can view manga sources"
  on storage.objects for select
  using (bucket_id = 'manga-sources');

create policy "Anyone can view rendered videos"
  on storage.objects for select
  using (bucket_id = 'rendered-videos');
