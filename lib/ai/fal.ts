import { fal } from "@fal-ai/client";
import { buildMotionPrompt } from "@/lib/ai/prompt";
import { resolveVideoModel, type VideoModelId } from "@/lib/ai/video-models";
import type { AiJobHandle, AiJobStatus, ImageToVideoConnector, ImageToVideoParams } from "@/lib/ai/types";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  fal.config({ credentials: process.env.FAL_KEY });
  configured = true;
}

/**
 * Each model takes a different input shape (see the schemas in
 * @fal-ai/client's endpoint types). LTX-2.3 — the customer default — honours
 * the editor's duration, fps and resolution exactly; the comparison models
 * get the closest values they accept.
 */
function buildInput(model: VideoModelId, params: ImageToVideoParams, prompt: string): Record<string, unknown> {
  const base = { image_url: params.imageUrl, prompt };
  switch (model) {
    case "kling-2.5-turbo":
      return { ...base, duration: params.durationSeconds >= 8 ? "10" : "5" };
    case "seedance-1-lite":
      return { ...base, duration: String(params.durationSeconds), resolution: "1080p", aspect_ratio: "auto" };
    case "hailuo-02":
      return { ...base, duration: params.durationSeconds >= 8 ? "10" : "6", resolution: "768P" };
    case "ltx-2.3-fast":
    default:
      return {
        ...base,
        duration: String(params.durationSeconds),
        fps: String(params.fps),
        resolution: params.resolution === "4k" ? "2160p" : "1080p",
        aspect_ratio: "auto",
        // Sound is the separate "Add AI sound" step, so renders stay silent.
        generate_audio: false,
      };
  }
}

export const falConnector: ImageToVideoConnector = {
  provider: "fal",

  async submit(params: ImageToVideoParams): Promise<AiJobHandle> {
    ensureConfigured();

    const prompt = buildMotionPrompt({
      userPrompt: params.prompt,
      cameraMovement: params.cameraMovement,
      motionIntensity: params.motionIntensity,
    });
    const model = resolveVideoModel(params.model);

    const { request_id } = await fal.queue.submit(model.endpoint, {
      input: buildInput(model.id, params, prompt),
      webhookUrl: params.webhookUrl,
    });

    return { provider: "fal", externalJobId: request_id };
  },

  async getStatus(externalJobId: string, modelId?: string | null): Promise<AiJobStatus> {
    ensureConfigured();
    const { endpoint } = resolveVideoModel(modelId);

    const status = await fal.queue.status(endpoint, {
      requestId: externalJobId,
      logs: false,
    });

    if (status.status === "COMPLETED") {
      const result = await fal.queue.result(endpoint, { requestId: externalJobId });
      const data = result.data as { video?: { url?: string } };
      return { status: "completed", videoUrl: data.video?.url };
    }

    if (status.status === "IN_PROGRESS") {
      return { status: "processing" };
    }

    if (status.status === "IN_QUEUE") {
      return { status: "pending" };
    }

    return { status: "failed", error: "Generation failed on fal.ai" };
  },
};
