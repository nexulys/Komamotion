import type { Resolution } from "@/lib/supabase/types";

/**
 * Credits per second of rendered video. Priced off the provider's real cost
 * (fal LTX-2.3 fast: ~$0.04/s at 1080p, ~$0.16/s at 2160p) so every plan
 * keeps a margin: a credit sells for $0.021–0.032 depending on the plan.
 * Update together with lib/ai/costs.ts when provider prices change.
 */
export const CREDITS_PER_SECOND: Record<Resolution, number> = {
  "1080p": 3,
  "4k": 12,
};

const COLORIZE_SURCHARGE = 1.25;
const REMOVE_TEXT_FLAT_COST = 3;
const UPSCALE_PER_SECOND = 1.5;
const AUDIO_PER_SECOND = 1;
const PANEL_EXTRACTION_FLAT_COST = 2;
const EXPORT_RATIO_FLAT_COST = 1;

export function calculateCreditsCost({
  durationSeconds,
  resolution,
  colorize,
  removeText = false,
}: {
  durationSeconds: number;
  resolution: Resolution;
  colorize: boolean;
  removeText?: boolean;
}) {
  const base = durationSeconds * CREDITS_PER_SECOND[resolution];
  const withColorize = colorize ? base * COLORIZE_SURCHARGE : base;
  const withCleanup = withColorize + (removeText ? REMOVE_TEXT_FLAT_COST : 0);
  return Math.max(1, Math.ceil(withCleanup));
}

export function calculateUpscaleCreditsCost(durationSeconds: number) {
  return Math.max(1, Math.ceil(durationSeconds * UPSCALE_PER_SECOND));
}

export function calculateAudioCreditsCost(durationSeconds: number) {
  return Math.max(1, Math.ceil(durationSeconds * AUDIO_PER_SECOND));
}

export function calculatePanelExtractionCreditsCost() {
  return PANEL_EXTRACTION_FLAT_COST;
}

export function calculateExportRatioCreditsCost() {
  return EXPORT_RATIO_FLAT_COST;
}

/** Roughly how many seconds of 1080p video a credit balance buys — for pricing copy. */
export function seconds1080pFor(credits: number) {
  return Math.floor(credits / CREDITS_PER_SECOND["1080p"]);
}

/** "3 min 20 s" style label for a number of seconds. */
export function formatVideoDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}
