-- KomaMotion AI — track on-demand 4K upscale / AI sound jobs on the
-- generation row. The editor reads these (live, via Realtime) to show a
-- running job, re-enable the button when a job fails and its credits are
-- refunded, and keep that state across page reloads. requested_at lets a
-- job lost without ever reporting back be requested again after an hour
-- (see lib/generation/enhancement-status.ts). Safe to re-run.

alter table public.generations
  add column if not exists upscale_status text,
  add column if not exists upscale_requested_at timestamptz,
  add column if not exists audio_status text,
  add column if not exists audio_requested_at timestamptz;

alter table public.generations drop constraint if exists generations_upscale_status_check;
alter table public.generations add constraint generations_upscale_status_check
  check (upscale_status in ('processing', 'completed', 'failed'));

alter table public.generations drop constraint if exists generations_audio_status_check;
alter table public.generations add constraint generations_audio_status_check
  check (audio_status in ('processing', 'completed', 'failed'));
