import { logger, task } from "@trigger.dev/sdk";
import { assembleEpisode } from "@/lib/media/episode";
import { extractThumbnail } from "@/lib/media/ffmpeg";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RENDERED_VIDEOS_BUCKET, resolveMediaUrl, uploadBufferToStorage } from "@/lib/supabase/signed-url";

/**
 * Builds an episode (see migration 0006 and lib/media/episode.ts): resolves
 * each chosen render's final video, assembles them with ffmpeg and stores
 * the result next to the project's other videos. Free of charge — the
 * renders were already paid for — and limited by the export rate limit.
 */
export const assembleEpisodeTask = task({
  id: "assemble-episode",
  // Re-encoding a few minutes of 1080×1920 video wants more than the default 0.5 vCPU.
  machine: "medium-2x",
  maxDuration: 1800,
  retry: { maxAttempts: 2, minTimeoutInMs: 5000, maxTimeoutInMs: 30_000, factor: 2 },
  run: async (payload: { episodeId: string }) => {
    const admin = createServiceRoleClient();
    const { data: episode } = await admin.from("episodes").select("*").eq("id", payload.episodeId).single();
    if (!episode) {
      logger.error("Episode not found", { episodeId: payload.episodeId });
      return;
    }

    await admin.from("episodes").update({ status: "processing", error_message: null }).eq("id", episode.id);

    const ids = episode.clips.map((c) => c.generation_id);
    const { data: generations } = await admin
      .from("generations")
      .select("id, output_video_url, status, progress")
      .in("id", ids)
      .eq("user_id", episode.user_id);

    const clips = [];
    for (const clip of episode.clips) {
      const generation = generations?.find((g) => g.id === clip.generation_id);
      if (!generation?.output_video_url || generation.status !== "completed" || generation.progress < 100) {
        throw new Error("One of the clips is no longer available. Remove it and build the episode again.");
      }
      const url = await resolveMediaUrl(RENDERED_VIDEOS_BUCKET, generation.output_video_url);
      if (!url) throw new Error("Could not read one of the clips");
      clips.push({ url, caption: clip.caption });
    }

    const { video, durationSeconds } = await assembleEpisode({
      clips,
      ratio: episode.aspect_ratio,
      transition: episode.transition,
      title: episode.title,
    });

    const base = `${episode.user_id}/${episode.project_id}/episode-${episode.id}`;
    const videoPath = await uploadBufferToStorage(RENDERED_VIDEOS_BUCKET, `${base}.mp4`, video, "video/mp4");
    let thumbnailPath: string | null = null;
    try {
      thumbnailPath = await uploadBufferToStorage(RENDERED_VIDEOS_BUCKET, `${base}-thumb.jpg`, await extractThumbnail(video), "image/jpeg");
    } catch (err) {
      logger.warn("Episode thumbnail failed", { episodeId: episode.id, error: err instanceof Error ? err.message : String(err) });
    }

    await admin
      .from("episodes")
      .update({
        status: "completed",
        output_video_url: videoPath,
        thumbnail_url: thumbnailPath,
        duration_seconds: Number(durationSeconds.toFixed(2)),
        completed_at: new Date().toISOString(),
      })
      .eq("id", episode.id);

    logger.info("Episode assembled", { episodeId: episode.id, clips: clips.length, durationSeconds });
  },
  onFailure: async ({ payload, error }) => {
    await createServiceRoleClient()
      .from("episodes")
      .update({ status: "failed", error_message: error instanceof Error ? error.message : "Episode assembly failed" })
      .eq("id", payload.episodeId);
  },
});
