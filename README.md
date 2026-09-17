# KomaMotion AI

**KomaMotion — A Nexulys SaaS.** Turn static manga panels and webtoon pages
into fluid, cinematic video sequences with image-to-video AI.

KomaMotion AI is the second official SaaS in the Nexulys ecosystem. Studios,
webtoon creators and mangakas import manga panels, clean up dialogue
bubbles, apply AI-driven motion, colorize, animate, upscale to 4K, add an
AI sound bed, and export MP4 video cropped for YouTube, TikTok/Reels or
Instagram — solo or in whole-chapter batches.

## Stack

- **Framework:** Next.js 15 (App Router, Server Actions, TypeScript)
- **UI:** Tailwind CSS v4, shadcn/ui (Radix primitives), Framer Motion, Lucide Icons
- **Auth & DB:** Supabase (Auth, PostgreSQL, Storage, Realtime)
- **Job queue:** Trigger.dev (durable background tasks, retries, cron)
- **AI generation:** fal.ai or Replicate (LTX-Video / CogVideoX image-to-video,
  Florence-2 grounding + LaMa inpainting, video upscaling), ElevenLabs (sound design)
- **Payments:** Stripe (subscriptions + credit packs)
- **Abuse protection:** Upstash Redis (`@upstash/ratelimit`)

## Project structure

```
app/
  (auth)/          login, register, Supabase OAuth callback
  (dashboard)/      projects gallery, editor/[id], billing
  admin/            internal ops dashboard (cost/margin, errors, retention)
  api/
    webhooks/stripe  Stripe subscription & payment webhooks
    webhooks/ai      fal.ai / Replicate callbacks (signature-verified)
    export/[id]      branded MP4 download endpoint
components/
  manga-uploader.tsx        drag-and-drop panel upload + preview, batch multi-select
  animation-settings.tsx    camera/intensity/fps/resolution/colorize/cleanup controls
  video-player.tsx          custom player with loop + download
  editor-workspace.tsx       glue for the editor page (Realtime, batch, exports)
  admin/                     admin-only UI (user table, credit grants)
  branding/nexulys-badge.tsx "Powered by Nexulys Ecosystem" mark
  ui/                        shadcn/ui primitives
lib/
  supabase/        server/browser clients, middleware, typed queries, signed URLs
  ai/               fal.ai/Replicate connectors, inpainting, panel extraction,
                     upscaling, audio, prompt builder, cost estimation
  media/ffmpeg.ts   watermark burn-in, aspect-ratio crop, audio mux
  generation/       shared idempotent finalize/refund logic
  stripe/           plans, credit pricing, checkout/customer helpers
  admin/            admin-only aggregate queries
  rate-limit.ts     Upstash-backed per-endpoint rate limiting
  webhooks/         Replicate (Svix) and fal.ai (JWKS/ED25519) signature verification
trigger/            Trigger.dev tasks — see "Background jobs" below
supabase/
  migrations/       versioned SQL: schema, RLS, storage policies, Realtime
```

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables** — copy `.env.example` to `.env.local`
   and fill in Supabase, Stripe, AI provider, Upstash and Trigger.dev
   credentials. `NEXT_PUBLIC_APP_URL` is required (not optional) once
   Trigger.dev tasks are involved, since they run outside any HTTP request
   and can't infer it from headers.

3. **Provision the database** — run every file in `supabase/migrations/`
   in order against your Supabase project (SQL editor, or `supabase db
   push`). This creates `users`, `projects`, `generations`,
   `credit_transactions`, `generation_exports` and `panel_extractions`
   with row-level security, adds `generations` to the Realtime
   publication, and switches the `manga-sources` / `rendered-videos`
   storage buckets to private with owner-scoped access policies.

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

5. **Run the Trigger.dev dev worker** (separate terminal) so background
   jobs actually execute locally:

   ```bash
   npm run trigger:dev
   ```

## Background jobs (Trigger.dev)

All AI/media pipeline work runs as durable Trigger.dev tasks (`trigger/`),
never inline in a server action, so nothing risks an HTTP timeout and every
step gets automatic retry with backoff (`trigger.config.ts`):

| Task | Trigger | What it does |
| --- | --- | --- |
| `generate-video` | on render start | optional inpainting cleanup, then submits the image-to-video job |
| `post-process-generation` | AI webhook / reconciliation | burns in the free-tier watermark |
| `upscale-generation` | "Upscale to 4K" button | submits + durably polls fal's video upscaler |
| `generate-audio` | "Add AI sound" button | ElevenLabs sound design, muxed in with ffmpeg |
| `extract-panels` | "Split page into panels" button | Florence-2 panel detection + crop |
| `export-ratio` | export buttons (16:9/9:16/1:1) | ffmpeg crop for the target channel |
| `batch-generate` | whole-chapter batch render | creates + fans out N renders in one call |
| `reconcile-stuck-generations` | cron, every 5 min | re-checks/finalizes renders a dropped webhook missed |
| `cleanup-storage` | cron, daily | deletes storage objects no DB row references anymore |

## Core workflow

1. Create a project and drag-and-drop manga panels (`manga-uploader.tsx`) —
   files upload directly to the private `manga-sources` bucket
   (`${userId}/${projectId}/...`), or split a full page into panels first.
2. Tune camera movement, intensity, FPS, resolution, AI colorization and
   bubble/SFX-text removal (`animation-settings.tsx`), then generate (solo
   or batch).
3. `startGeneration` debits credits and triggers `generate-video`. Progress
   streams into the editor over **Supabase Realtime** (`generations.progress`,
   0–100); the provider's signature-verified webhook is the source of truth
   for completion, with a cron reconciliation pass as a safety net for a
   dropped delivery.
4. Preview and download with `video-player.tsx`, optionally upscale to 4K,
   add an AI sound bed, or export additional aspect ratios for other
   channels — all on-demand, credit-metered add-ons.

## Credits & plans

1 credit ≈ 1 second of rendered 1080p video; 4K costs 2×, colorization adds
25%, and text/bubble removal adds a flat surcharge (`lib/stripe/credits.ts`).
A **Free** tier (20 signup credits, watermarked, no Stripe subscription)
sits alongside Starter/Studio/Pro; paid plans grant a monthly credit pool
on `invoice.payment_succeeded` and never carry the watermark
(`lib/stripe/plans.ts`).

## Admin dashboard

`/admin` (gated on `users.is_admin`) tracks estimated AI provider spend vs.
credits charged and estimated margin, render error rate, plan mix/MRR, and
7-day retention — plus a users table for manual credit grants and admin
role toggles.

---

_KomaMotion — A Nexulys SaaS._
