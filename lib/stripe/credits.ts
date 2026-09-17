import type { Resolution } from "@/lib/supabase/types";

// 1 credit == 1 second of rendered 1080p video. 4K costs 2x.
const RESOLUTION_MULTIPLIER: Record<Resolution, number> = {
  "1080p": 1,
  "4k": 2,
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
  const base = durationSeconds * RESOLUTION_MULTIPLIER[resolution];
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
