import { fal } from "@fal-ai/client";
import { buildMotionPrompt } from "@/lib/ai/prompt";
import type { AiJobHandle, AiJobStatus, ImageToVideoConnector, ImageToVideoParams } from "@/lib/ai/types";

// LTX-Video image-to-video, served via fal.ai's queue API. Typed as a
// widened `string` (not a literal) so we can pass the full set of
// generation params — the exact accepted fields vary by model/version.
const MODEL_ENDPOINT: string = "fal-ai/ltx-video/image-to-video";

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
        num_frames: Math.round(params.durationSeconds * params.fps),
        fps: params.fps,
        motion_bucket_id: Math.round(params.motionIntensity * 255),
        resolution: params.resolution === "4k" ? "2160p" : "1080p",
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
      const data = result.data as { video?: { url?: string }; thumbnail?: { url?: string } };
      return {
        status: "completed",
        videoUrl: data.video?.url,
        thumbnailUrl: data.thumbnail?.url,
      };
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
