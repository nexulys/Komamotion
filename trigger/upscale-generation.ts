import { logger, task, wait } from "@trigger.dev/sdk";
import { getVideoUpscaleStatus, submitVideoUpscale } from "@/lib/ai/upscale";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RENDERED_VIDEOS_BUCKET, buildStoragePath, uploadBufferToStorage } from "@/lib/supabase/signed-url";
import { refundCredits } from "@/lib/generation/pipeline";

const MAX_POLLS = 40; // ~10 min ceiling at 15s intervals

/**
 * On-demand 4K upscale for a completed render (user-triggered from the
 * editor, plan-gated). Submits to fal's queue and durably polls with
 * `wait.for` — no separate webhook route needed since this is a single
 * user-initiated job, not part of the high-volume core render path.
 */
export const upscaleGenerationTask = task({
  id: "upscale-generation",
  retry: { maxAttempts: 2, minTimeoutInMs: 5000, maxTimeoutInMs: 30_000, factor: 2 },
  run: async (payload: { generationId: string; creditsCost: number }) => {
    const admin = createServiceRoleClient();

    const { data: generation } = await admin
      .from("generations")
      .select("*")
      .eq("id", payload.generationId)
      .single();

    if (!generation?.output_video_url) {
      logger.error("No output video to upscale", { generationId: payload.generationId });
      return;
    }

    const { externalJobId } = await submitVideoUpscale({
      videoUrl: generation.output_video_url,
      targetResolution: "4k",
    });

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      const status = await getVideoUpscaleStatus(externalJobId);

      if (status.status === "completed" && status.videoUrl) {
        const response = await fetch(status.videoUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        const path = buildStoragePath(generation.user_id, generation.project_id, "upscaled-4k.mp4");
        await uploadBufferToStorage(RENDERED_VIDEOS_BUCKET, path, buffer, "video/mp4");

        await admin
          .from("generations")
          .update({ upscaled_video_url: path, resolution: "4k" })
          .eq("id", generation.id);

        logger.info("Upscale complete", { generationId: generation.id });
        return;
      }

      if (status.status === "failed") {
        throw new Error(status.error ?? "Upscale failed");
      }

      await wait.for({ seconds: 15 });
    }

    throw new Error("Upscale timed out after 10 minutes");
  },
  onFailure: async ({ payload }) => {
    const admin = createServiceRoleClient();
    const { data: generation } = await admin
      .from("generations")
      .select("user_id")
      .eq("id", payload.generationId)
      .single();

    if (generation) {
      await refundCredits(admin, {
        userId: generation.user_id,
        amount: payload.creditsCost,
        generationId: payload.generationId,
        description: "Refund for failed 4K upscale",
      });
    }
  },
});
