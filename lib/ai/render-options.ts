import type { CameraMovement, Resolution } from "@/lib/supabase/types";

/**
 * The render settings the video model actually accepts (fal LTX-2.3, see
 * lib/ai/fal.ts). The editor only offers these values, and the server
 * snaps whatever the browser sends onto them before pricing a render — so
 * a hand-crafted request can't, say, ask for 0.1 s to pay a single credit.
 */
export const VIDEO_DURATIONS = [6, 8, 10] as const;
export const VIDEO_FPS = [24, 25, 48, 50] as const;
export const RESOLUTIONS: readonly Resolution[] = ["1080p", "4k"];
export const CAMERA_MOVEMENT_VALUES: readonly CameraMovement[] = [
  "static",
  "pan_left",
  "pan_right",
  "zoom_in",
  "zoom_out",
  "dolly_in",
  "orbit",
];
export const MAX_PROMPT_LENGTH = 500;

export type RenderSettings = {
  prompt: string;
  cameraMovement: CameraMovement;
  motionIntensity: number;
  fps: number;
  resolution: Resolution;
  colorize: boolean;
  removeText: boolean;
  durationSeconds: number;
};

function nearest(value: number, allowed: readonly number[]) {
  const n = Number.isFinite(value) ? value : allowed[0];
  return allowed.reduce((best, option) => (Math.abs(option - n) < Math.abs(best - n) ? option : best));
}

export function normalizeRenderSettings(settings: RenderSettings): RenderSettings {
  const intensity = Number(settings.motionIntensity);
  return {
    prompt: String(settings.prompt ?? "").slice(0, MAX_PROMPT_LENGTH),
    cameraMovement: CAMERA_MOVEMENT_VALUES.includes(settings.cameraMovement) ? settings.cameraMovement : "zoom_in",
    motionIntensity: Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0.5,
    fps: nearest(Number(settings.fps), VIDEO_FPS),
    resolution: RESOLUTIONS.includes(settings.resolution) ? settings.resolution : "1080p",
    colorize: settings.colorize === true,
    removeText: settings.removeText === true,
    durationSeconds: nearest(Number(settings.durationSeconds), VIDEO_DURATIONS),
  };
}
