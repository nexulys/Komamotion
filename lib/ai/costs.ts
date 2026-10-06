import type { AiProvider, Resolution } from "@/lib/supabase/types";

/**
 * Rough $/unit estimates for provider billing, used only for the admin
 * margin dashboard (credits charged vs. real AI spend) — not for user
 * pricing, which is credit-based (see lib/stripe/credits.ts). Update these
 * from your fal.ai / Replicate / ElevenLabs invoices as actual costs drift.
 */
export const PROVIDER_COST_PER_SECOND: Record<AiProvider, Record<Resolution, number>> = {
  fal: { "1080p": 0.08, "4k": 0.18 },
  replicate: { "1080p": 0.1, "4k": 0.22 },
};

export const INPAINTING_COST_USD = 0.02; // per image
export const PANEL_EXTRACTION_COST_USD = 0.01; // per page
export const UPSCALE_COST_PER_SECOND_USD = 0.05;
export const AUDIO_COST_PER_SECOND_USD = 0.02;

export function estimateGenerationCostUsd({
  provider,
  resolution,
  durationSeconds,
  colorize,
  removeText,
}: {
  provider: AiProvider;
  resolution: Resolution;
  durationSeconds: number;
  colorize: boolean;
  removeText: boolean;
}) {
  let cost = PROVIDER_COST_PER_SECOND[provider][resolution] * durationSeconds;
  if (colorize) cost += durationSeconds * 0.015;
  if (removeText) cost += INPAINTING_COST_USD;
  return Number(cost.toFixed(4));
}

export function estimateUpscaleCostUsd(durationSeconds: number) {
  return Number((UPSCALE_COST_PER_SECOND_USD * durationSeconds).toFixed(4));
}

export function estimateAudioCostUsd(durationSeconds: number) {
  return Number((AUDIO_COST_PER_SECOND_USD * durationSeconds).toFixed(4));
}
