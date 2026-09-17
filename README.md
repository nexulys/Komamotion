# KomaMotion AI

**KomaMotion — A Nexulys SaaS.** Turn static manga panels and webtoon pages
into fluid, cinematic video sequences with image-to-video AI.

KomaMotion AI is the second official SaaS in the Nexulys ecosystem. Studios,
webtoon creators and mangakas import manga panels, apply AI-driven motion
(camera movement, animation intensity, optional colorization), preview the
result, and export MP4 video at 1080p or 4K.

## Stack

- **Framework:** Next.js 15 (App Router, Server Actions, TypeScript)
- **UI:** Tailwind CSS v4, shadcn/ui (Radix primitives), Framer Motion, Lucide Icons
- **Auth & DB:** Supabase (Auth, PostgreSQL, Storage)
- **AI generation:** fal.ai or Replicate (LTX-Video / CogVideoX image-to-video)
- **Payments:** Stripe (subscriptions + credit packs)

## Project structure

```
app/
  (auth)/          login, register, Supabase OAuth callback
  (dashboard)/      projects gallery, editor/[id], billing
  api/
    webhooks/stripe  Stripe subscription & payment webhooks
    webhooks/ai      fal.ai / Replicate generation callbacks
    export/[id]      branded MP4 download endpoint
components/
  manga-uploader.tsx        drag-and-drop panel upload + preview
  animation-settings.tsx    camera/intensity/fps/resolution/colorize controls
  video-player.tsx          custom player with loop + download
  editor-workspace.tsx       glue for the editor page
  branding/nexulys-badge.tsx "Powered by Nexulys Ecosystem" mark
  ui/                        shadcn/ui primitives
lib/
  supabase/        server/browser clients, middleware, typed queries
  ai/               fal.ai / Replicate connectors + prompt builder
  stripe/           plans, credit pricing, checkout/customer helpers
supabase/
  schema.sql        tables, RLS policies, storage buckets
```

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables** — copy `.env.example` to `.env.local`
   and fill in your Supabase, Stripe and AI provider credentials.

3. **Provision the database** — run `supabase/schema.sql` against your
   Supabase project (SQL editor or `supabase db push`). It creates the
   `users`, `projects`, `generations` and `credit_transactions` tables with
   row-level security, plus the `manga-sources` / `rendered-videos` storage
   buckets.

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Core workflow

1. Create a project and drag-and-drop manga panels (`manga-uploader.tsx`) —
   files upload directly to Supabase Storage.
2. Tune camera movement, animation intensity, FPS, resolution and optional
   AI colorization (`animation-settings.tsx`), then generate.
3. `startGeneration` (server action) debits credits, creates a `generations`
   row, and submits the image-to-video job to fal.ai/Replicate with a
   webhook callback. The editor polls `refreshGenerationStatus` every few
   seconds as a fallback while the provider's webhook hits
   `/api/webhooks/ai` — either path updates Postgres, so the UI reflects
   `pending → processing → completed/failed` in near real time without an
   HTTP timeout, since the actual render runs out-of-band.
4. Preview and download the result with `video-player.tsx`, or fetch a
   cleanly-named file from `/api/export/[generationId]`.

## Credits

1 credit ≈ 1 second of rendered 1080p video; 4K costs 2×, and AI
colorization adds a 25% surcharge (`lib/stripe/credits.ts`). Stripe
subscriptions grant a monthly credit pool on `invoice.payment_succeeded`;
one-off credit packs are also available from the billing page.

---

_KomaMotion — A Nexulys SaaS._
