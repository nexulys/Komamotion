-- KomaMotion AI — episodes: finished renders of a project assembled, in
-- order, into one publish-ready video (vertical for TikTok/Reels/Shorts,
-- horizontal or square), with an optional title card and per-clip captions.
-- Assembly runs in the assemble-episode Trigger.dev task; all writes go
-- through the service role. Safe to re-run.

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  title text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  aspect_ratio text not null default '9:16' check (aspect_ratio in ('16:9', '9:16', '1:1')),
  transition text not null default 'fade' check (transition in ('cut', 'fade')),
  -- [{ "generation_id": uuid, "caption": text | null }] in playback order
  clips jsonb not null default '[]'::jsonb,
  output_video_url text,
  thumbnail_url text,
  duration_seconds numeric(8, 2),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists episodes_project_id_idx on public.episodes (project_id);

drop trigger if exists set_episodes_updated_at on public.episodes;
create trigger set_episodes_updated_at before update on public.episodes
  for each row execute procedure public.set_updated_at();

alter table public.episodes enable row level security;

drop policy if exists "Users can view own episodes" on public.episodes;
create policy "Users can view own episodes" on public.episodes
  for select using (auth.uid() = user_id);
