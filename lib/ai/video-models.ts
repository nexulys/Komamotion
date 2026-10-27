/**
 * Image-to-video models the app can render with. LTX-2.3 (fast) is what
 * customers get; the others exist so an admin can compare quality on real
 * manga panels before committing to a model (see the editor's model picker,
 * shown to admins only). Every model is called through fal's queue API —
 * the input mapping per model lives in lib/ai/fal.ts.
 *
 * Pure data: safe to import from client components.
 */
export type VideoModelId = "ltx-2.3-fast" | "kling-2.5-turbo" | "seedance-1-lite" | "hailuo-02";

export type VideoModel = {
  id: VideoModelId;
  label: string;
  endpoint: string;
  /** What admins should know when comparing (output limits, list price). */
  note: string;
};

export const VIDEO_MODELS: Record<VideoModelId, VideoModel> = {
  "ltx-2.3-fast": {
    id: "ltx-2.3-fast",
    label: "LTX-2.3 fast (default)",
    endpoint: "fal-ai/ltx-2.3/image-to-video/fast",
    note: "6/8/10 s, 1080p or 2160p · ~$0.04/s at 1080p",
  },
  "kling-2.5-turbo": {
    id: "kling-2.5-turbo",
    label: "Kling 2.5 Turbo (test)",
    endpoint: "fal-ai/kling-video/v2.5-turbo/standard/image-to-video",
    note: "5 or 10 s, fixed resolution · check price on fal",
  },
  "seedance-1-lite": {
    id: "seedance-1-lite",
    label: "Seedance 1 Lite (test)",
    endpoint: "fal-ai/bytedance/seedance/v1/lite/image-to-video",
    note: "2–12 s, up to 1080p · check price on fal",
  },
  "hailuo-02": {
    id: "hailuo-02",
    label: "Hailuo 02 (test)",
    endpoint: "fal-ai/minimax/hailuo-02/standard/image-to-video",
    note: "6 or 10 s, 768p · check price on fal",
  },
};

export const DEFAULT_VIDEO_MODEL: VideoModelId = "ltx-2.3-fast";

/**
 * The model stored on a generation row. Rows created before the registry
 * hold the legacy "ltx-video" value (or nothing usable) and were rendered
 * with the default model.
 */
export function resolveVideoModel(value: string | null | undefined): VideoModel {
  return value && value in VIDEO_MODELS ? VIDEO_MODELS[value as VideoModelId] : VIDEO_MODELS[DEFAULT_VIDEO_MODEL];
}
