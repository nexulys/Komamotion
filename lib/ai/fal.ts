import { fal } from "@fal-ai/client";
import { buildMotionPrompt } from "@/lib/ai/prompt";
import type { AiJobHandle, AiJobStatus, ImageToVideoConnector, ImageToVideoParams } from "@/lib/ai/types";

// LTX-2.3 (fast) image-to-video via fal.ai's queue API. Unlike the original
// LTX-Video endpoint (which only takes an image + prompt), it honours the
// editor's duration (6/8/10 s), fps and resolution (1080p or true 2160p) —
// see lib/ai/render-options.ts for the values it accepts.
const MODEL_ENDPOINT = "fal-ai/ltx-2.3/image-to-video/fast";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  fal.config({ credentials: process.env.FAL_KEY });
  configured = true;
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

    const { request_id } = await fal.queue.submit(MODEL_ENDPOINT, {
      input: {
        image_url: params.imageUrl,
        prompt,
        duration: String(params.durationSeconds) as "6" | "8" | "10",
        fps: String(params.fps) as "24" | "25" | "48" | "50",
        resolution: params.resolution === "4k" ? "2160p" : "1080p",
        aspect_ratio: "auto",
        // Sound is the separate "Add AI sound" step, so renders stay silent.
        generate_audio: false,
      },
      webhookUrl: params.webhookUrl,
    });

    return { provider: "fal", externalJobId: request_id };
  },

  async getStatus(externalJobId: string): Promise<AiJobStatus> {
    ensureConfigured();

    const status = await fal.queue.status(MODEL_ENDPOINT, {
      requestId: externalJobId,
      logs: false,
    });

    if (status.status === "COMPLETED") {
      const result = await fal.queue.result(MODEL_ENDPOINT, {
        requestId: externalJobId,
      });
      return { status: "completed", videoUrl: result.data.video?.url };
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
