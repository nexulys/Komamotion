import type { Resolution } from "@/lib/supabase/types";

// 1 credit == 1 second of rendered 1080p video. 4K costs 2x.
const RESOLUTION_MULTIPLIER: Record<Resolution, number> = {
  "1080p": 1,
  "4k": 2,
};

const COLORIZE_SURCHARGE = 1.25;

export function calculateCreditsCost({
  durationSeconds,
  resolution,
  colorize,
}: {
  durationSeconds: number;
  resolution: Resolution;
  colorize: boolean;
}) {
  const base = durationSeconds * RESOLUTION_MULTIPLIER[resolution];
  const withColorize = colorize ? base * COLORIZE_SURCHARGE : base;
  return Math.max(1, Math.ceil(withColorize));
}
