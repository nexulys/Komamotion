import type { EpisodeClip, EpisodeTransition, ExportRatio } from "@/lib/supabase/types";

/** Limits shared by the editor and the server (pure — safe in client components). */
export const MAX_EPISODE_CLIPS = 24;
export const MAX_EPISODE_TITLE = 80;
export const MAX_EPISODE_CAPTION = 120;

export const EPISODE_FORMATS: { value: ExportRatio; label: string }[] = [
  { value: "9:16", label: "Vertical 9:16 — TikTok, Reels, Shorts" },
  { value: "16:9", label: "Horizontal 16:9 — YouTube" },
  { value: "1:1", label: "Square 1:1 — Instagram feed" },
];

export const EPISODE_TRANSITIONS: { value: EpisodeTransition; label: string }[] = [
  { value: "fade", label: "Crossfade" },
  { value: "cut", label: "Hard cut" },
];

export type EpisodeRequest = {
  title?: string | null;
  aspectRatio: string;
  transition: string;
  clips: { generationId: string; caption?: string | null }[];
};

export type ValidEpisode = {
  title: string | null;
  aspect_ratio: ExportRatio;
  transition: EpisodeTransition;
  clips: EpisodeClip[];
};

/** Normalizes what the browser sent, or explains what's wrong with it. */
export function validateEpisodeRequest(request: EpisodeRequest): { data: ValidEpisode } | { error: string } {
  const clips = Array.isArray(request.clips) ? request.clips : [];
  if (clips.length === 0) return { error: "Pick at least one finished render." };
  if (clips.length > MAX_EPISODE_CLIPS) return { error: `An episode can hold up to ${MAX_EPISODE_CLIPS} clips.` };
  if (!EPISODE_FORMATS.some((f) => f.value === request.aspectRatio)) return { error: "Unknown format." };
  if (!EPISODE_TRANSITIONS.some((t) => t.value === request.transition)) return { error: "Unknown transition." };

  const title = String(request.title ?? "").trim().slice(0, MAX_EPISODE_TITLE);
  return {
    data: {
      title: title || null,
      aspect_ratio: request.aspectRatio as ExportRatio,
      transition: request.transition as EpisodeTransition,
      clips: clips.map((c) => {
        const caption = String(c.caption ?? "").trim().slice(0, MAX_EPISODE_CAPTION);
        return { generation_id: String(c.generationId), caption: caption || null };
      }),
    },
  };
}
