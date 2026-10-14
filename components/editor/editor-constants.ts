import type { AnimationSettingsValue } from "@/components/animation-settings";
import type { EnhancementKind } from "@/lib/generation/enhancement-status";
import type { ExportRatio, GenerationRow } from "@/lib/supabase/types";

export const DEFAULT_SETTINGS: AnimationSettingsValue = {
  prompt: "",
  cameraMovement: "zoom_in",
  motionIntensity: 0.5,
  fps: 24,
  resolution: "1080p",
  colorize: false,
  removeText: false,
  durationSeconds: 4,
};

export const STATUS_LABEL: Record<GenerationRow["status"], string> = {
  pending: "Queued",
  processing: "Rendering…",
  completed: "Completed",
  failed: "Failed",
};

/** How often the editor checks on an export / panel split, and when it stops waiting (one Trigger.dev attempt's ceiling). */
export const POLL_INTERVAL_MS = 4000;
export const POLL_TIMEOUT_MS = 15 * 60 * 1000;

export const ENHANCEMENT_MESSAGES: Record<EnhancementKind, { queued: string; completed: string; failed: string }> = {
  upscale: {
    queued: "4K upscale queued.",
    completed: "Your 4K version is ready!",
    failed: "4K upscale failed. Credits refunded.",
  },
  audio: {
    queued: "AI sound design queued.",
    completed: "AI sound added to your animation!",
    failed: "AI sound generation failed. Credits refunded.",
  },
};

export const EXPORT_RATIOS: ExportRatio[] = ["16:9", "9:16", "1:1"];
export const RATIO_LABEL: Record<ExportRatio, string> = {
  "16:9": "YouTube (16:9)",
  "9:16": "TikTok / Reels (9:16)",
  "1:1": "Instagram (1:1)",
};
