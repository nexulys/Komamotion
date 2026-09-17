import { fal } from "@fal-ai/client";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  fal.config({ credentials: process.env.FAL_KEY });
  configured = true;
}

// Real-ESRGAN-based video upscaler, served via fal.ai's queue API — same
// async pattern as the main image-to-video job (see lib/ai/fal.ts).
const UPSCALER_ENDPOINT: string = "fal-ai/video-upscaler";

export async function submitVideoUpscale({
  videoUrl,
  targetResolution,
}: {
  videoUrl: string;
  targetResolution: "4k";
}): Promise<{ externalJobId: string }> {
  ensureConfigured();

  const { request_id } = await fal.queue.submit(UPSCALER_ENDPOINT, {
    input: {
      video_url: videoUrl,
      scale: targetResolution === "4k" ? 2 : 1,
      face_enhance: false,
    },
  });

  return { externalJobId: request_id };
}

export async function getVideoUpscaleStatus(externalJobId: string): Promise<{
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}> {
  ensureConfigured();

  const status = await fal.queue.status(UPSCALER_ENDPOINT, {
    requestId: externalJobId,
    logs: false,
  });

  if (status.status === "COMPLETED") {
    const result = await fal.queue.result(UPSCALER_ENDPOINT, { requestId: externalJobId });
    const data = result.data as { video?: { url?: string } };
    return { status: "completed", videoUrl: data.video?.url };
  }
  if (status.status === "IN_PROGRESS") return { status: "processing" };
  if (status.status === "IN_QUEUE") return { status: "pending" };
  return { status: "failed", error: "Upscaling failed on fal.ai" };
}
