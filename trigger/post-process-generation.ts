import { logger, task } from "@trigger.dev/sdk";
import { applyWatermark } from "@/lib/media/ffmpeg";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RENDERED_VIDEOS_BUCKET, buildStoragePath, uploadBufferToStorage } from "@/lib/supabase/signed-url";
import { planHasWatermark } from "@/lib/stripe/plans";

/**
 * Runs right after a render completes (triggered from the AI webhook
 * handler). Burns in the free-tier watermark before the video is ever
 * shown to the user — retried automatically by Trigger.dev on transient
 * ffmpeg/storage failures per trigger.config.ts's default retry policy.
 */
export const postProcessGenerationTask = task({
  id: "post-process-generation",
  retry: { maxAttempts: 4, minTimeoutInMs: 5000, maxTimeoutInMs: 60_000, factor: 2 },
  run: async (payload: { generationId: string }) => {
    const admin = createServiceRoleClient();

    const { data: generation } = await admin
      .from("generations")
      .select("*")
      .eq("id", payload.generationId)
      .single();

    if (!generation || generation.status !== "completed" || !generation.output_video_url) {
      logger.warn("Nothing to post-process", { generationId: payload.generationId });
      return;
    }

    if (generation.watermarked) {
      logger.info("Already watermarked, skipping", { generationId: generation.id });
      return;
    }

    const { data: user } = await admin
      .from("users")
      .select("plan")
      .eq("id", generation.user_id)
      .single();

    if (!user || !planHasWatermark(user.plan)) {
      await admin.from("generations").update({ progress: 100 }).eq("id", generation.id);
      return;
    }

    const watermarkedBuffer = await applyWatermark(generation.output_video_url);
    const path = buildStoragePath(generation.user_id, generation.project_id, "watermarked.mp4");
    await uploadBufferToStorage(RENDERED_VIDEOS_BUCKET, path, watermarkedBuffer, "video/mp4");

    await admin
      .from("generations")
      .update({ output_video_url: path, watermarked: true, progress: 100 })
      .eq("id", generation.id);

    logger.info("Watermark applied", { generationId: generation.id });
  },
});
