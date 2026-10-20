import type { Database, EnhancementStatus, GenerationRow } from "@/lib/supabase/types";

/** On-demand jobs run on a finished render; each has a status + requested_at pair of columns (migration 0005). */
export type EnhancementKind = "upscale" | "audio";

export type EnhancementState = { status: EnhancementStatus | null; requestedAt: string | null };

type GenerationUpdate = Database["public"]["Tables"]["generations"]["Update"];

/**
 * A job still "processing" after this long is treated as lost — Trigger.dev's
 * worst case is 3 attempts of up to 15 min each — so it can be requested again
 * instead of leaving the button disabled forever.
 */
export const ENHANCEMENT_STALE_AFTER_MS = 60 * 60 * 1000;

export function getEnhancementState(
  generation: Pick<GenerationRow, "upscale_status" | "upscale_requested_at" | "audio_status" | "audio_requested_at">,
  kind: EnhancementKind
): EnhancementState {
  return kind === "upscale"
    ? { status: generation.upscale_status, requestedAt: generation.upscale_requested_at }
    : { status: generation.audio_status, requestedAt: generation.audio_requested_at };
}

export function isEnhancementRunning(
  generation: Pick<GenerationRow, "upscale_status" | "upscale_requested_at" | "audio_status" | "audio_requested_at">,
  kind: EnhancementKind,
  now: number = Date.now()
): boolean {
  const { status, requestedAt } = getEnhancementState(generation, kind);
  return status === "processing" && requestedAt !== null && now - Date.parse(requestedAt) < ENHANCEMENT_STALE_AFTER_MS;
}

/** Column patch for one job's status; `requestedAt` is only written when given. */
export function enhancementPatch(
  kind: EnhancementKind,
  status: EnhancementStatus | null,
  requestedAt?: string | null
): GenerationUpdate {
  if (kind === "upscale") {
    return requestedAt === undefined
      ? { upscale_status: status }
      : { upscale_status: status, upscale_requested_at: requestedAt };
  }
  return requestedAt === undefined
    ? { audio_status: status }
    : { audio_status: status, audio_requested_at: requestedAt };
}
