import Replicate from "replicate";
import { buildMotionPrompt } from "@/lib/ai/prompt";
import type { AiJobHandle, AiJobStatus, ImageToVideoConnector, ImageToVideoParams } from "@/lib/ai/types";

// CogVideoX-5b image-to-video model on Replicate.
const MODEL_VERSION =
  process.env.REPLICATE_MODEL_VERSION ??
  "fofr/cogvideox-5b-i2v:57f1b5b7fd7a3ba7c9c2ae3f5b3a58ba6f0c4b8b5c2a7d5f1a8c3b9d6e2f4a1b";

let client: Replicate | null = null;
function getClient() {
  if (!client) {
    client = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  }
  return client;
}

export const replicateConnector: ImageToVideoConnector = {
  provider: "replicate",

  async submit(params: ImageToVideoParams): Promise<AiJobHandle> {
    const replicate = getClient();

    const prompt = buildMotionPrompt({
      userPrompt: params.prompt,
      cameraMovement: params.cameraMovement,
      motionIntensity: params.motionIntensity,
    });

    const prediction = await replicate.predictions.create({
      version: MODEL_VERSION,
      input: {
        input_image: params.imageUrl,
        prompt,
        num_frames: Math.round(params.durationSeconds * params.fps),
        fps: params.fps,
        motion_strength: params.motionIntensity,
        video_size: params.resolution === "4k" ? "2160x2160" : "1080x1080",
      },
      webhook: params.webhookUrl,
      webhook_events_filter: params.webhookUrl ? ["completed"] : undefined,
    });

    return { provider: "replicate", externalJobId: prediction.id };
  },

  async getStatus(externalJobId: string): Promise<AiJobStatus> {
    const replicate = getClient();
    const prediction = await replicate.predictions.get(externalJobId);

    switch (prediction.status) {
      case "succeeded": {
        const output = prediction.output as string | string[] | null;
        const videoUrl = Array.isArray(output) ? output[0] : output ?? undefined;
        return { status: "completed", videoUrl };
      }
      case "failed":
      case "canceled":
        return {
          status: "failed",
          error: prediction.error ? String(prediction.error) : "Generation failed on Replicate",
        };
      case "processing":
        return { status: "processing" };
      default:
        return { status: "pending" };
    }
  },
};
