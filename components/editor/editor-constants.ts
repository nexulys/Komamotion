import type { AnimationSettingsValue } from "@/components/animation-settings";
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

export const EXPORT_RATIOS: ExportRatio[] = ["16:9", "9:16", "1:1"];
export const RATIO_LABEL: Record<ExportRatio, string> = {
  "16:9": "YouTube (16:9)",
  "9:16": "TikTok / Reels (9:16)",
  "1:1": "Instagram (1:1)",
};
