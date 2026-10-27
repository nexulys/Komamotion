import { logger, task } from "@trigger.dev/sdk";
import { applyWatermark, extractThumbnail } from "@/lib/media/ffmpeg";
import { getAppUrl } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  RENDERED_VIDEOS_BUCKET,
  deleteFromStorage,
  resolveMediaUrl,
  uploadBufferToStorage,
} from "@/lib/supabase/signed-url";
import { planHasWatermark } from "@/lib/stripe/plans";
import { refundCredits } from "@/lib/generation/pipeline";

/**
 * Runs right after a render completes (triggered from the AI webhook
 * handler). Burns in the free-tier watermark before the video is ever
 * shown to the user — retried automatically by Trigger.dev on transient
 * ffmpeg/storage failures per trigger.config.ts's default retry policy.
 */
/** "Made with KomaMotion · komamotion.com": every free video shared is an ad with the address on it. */
function watermarkLabel() {
  try {
    const host = new URL(getAppUrl()).host.replace(/[^a-z0-9.-]/gi, "");
    return host ? `Made with KomaMotion · ${host}` : "Made with KomaMotion";
  } catch {
    return "Made with KomaMotion";
  }
}

/** Best-effort poster frame; a render is never held back for lack of one. */
async function makeThumbnail(
  generation: { id: string; user_id: string; project_id: string; thumbnail_url: string | null },
  source: string | Buffer
): Promise<string | null> {
  if (generation.thumbnail_url) return null;
  try {
    const path = `${generation.user_id}/${generation.project_id}/${generation.id}-thumb.jpg`;
    await uploadBufferToStorage(RENDERED_VIDEOS_BUCKET, path, await extractThumbnail(source), "image/jpeg");
    return path;
  } catch (err) {
    logger.warn("Thumbnail extraction failed", { generationId: generation.id, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

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

    const sourceUrl = await resolveMediaUrl(RENDERED_VIDEOS_BUCKET, generation.output_video_url);
    if (!sourceUrl) throw new Error("Could not resolve the rendered video for post-processing");

    if (!user || !planHasWatermark(user.plan)) {
      const thumbnailPath = await makeThumbnail(generation, sourceUrl);
      await admin
        .from("generations")
        .update({ progress: 100, ...(thumbnailPath ? { thumbnail_url: thumbnailPath } : {}) })
        .eq("id", generation.id);
      return;
    }

    const watermarkedBuffer = await applyWatermark(sourceUrl, watermarkLabel());
    const path = `${generation.user_id}/${generation.project_id}/${generation.id}-wm.mp4`;
    await uploadBufferToStorage(RENDERED_VIDEOS_BUCKET, path, watermarkedBuffer, "video/mp4");
    // Taken from the watermarked copy, so not even the poster frame is clean.
    const thumbnailPath = await makeThumbnail(generation, watermarkedBuffer);

    await admin
      .from("generations")
      .update({
        output_video_url: path,
        watermarked: true,
        progress: 100,
        ...(thumbnailPath ? { thumbnail_url: thumbnailPath } : {}),
      })
      .eq("id", generation.id);

    // The unwatermarked original sits in the user's own folder, where the
    // storage read policy would let them fetch it directly — remove it.
    if (generation.output_video_url !== path && !/^https?:\/\//i.test(generation.output_video_url)) {
      await deleteFromStorage(RENDERED_VIDEOS_BUCKET, [generation.output_video_url]);
    }

    logger.info("Watermark applied", { generationId: generation.id });
  },
  // The video is only shown once finalized (progress 100). If that can't
  // happen, fail the render and refund rather than charging for a video
  // the user never gets.
  onFailure: async ({ payload, error }) => {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("generations")
      .update({
        status: "failed",
        error_message: "Your video could not be finalized. Your credits were refunded.",
      })
      .eq("id", payload.generationId)
      .eq("status", "completed")
      .lt("progress", 100)
      .select("user_id, credits_cost");
    const row = data?.[0];
    if (!row) return;
    logger.error("Post-process failed for good", {
      generationId: payload.generationId,
      error: error instanceof Error ? error.message : String(error),
    });
    await refundCredits(admin, {
      userId: row.user_id,
      amount: row.credits_cost,
      generationId: payload.generationId,
      description: "Refund — video could not be finalized",
    });
  },
});
