import { logger, task } from "@trigger.dev/sdk";
import { cropToRatio } from "@/lib/media/ffmpeg";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RENDERED_VIDEOS_BUCKET, buildStoragePath, uploadBufferToStorage } from "@/lib/supabase/signed-url";

/** Crops a completed render to a channel-specific aspect ratio (16:9 / 9:16 / 1:1) on demand. */
export const exportRatioTask = task({
  id: "export-ratio",
  retry: { maxAttempts: 3, minTimeoutInMs: 3000, maxTimeoutInMs: 30_000, factor: 2 },
  run: async (payload: { generationExportId: string }) => {
    const admin = createServiceRoleClient();

    const { data: exportRow } = await admin
      .from("generation_exports")
      .select("*")
      .eq("id", payload.generationExportId)
      .single();

    if (!exportRow) {
      logger.error("Export not found", { id: payload.generationExportId });
      return;
    }

    const { data: generation } = await admin
      .from("generations")
      .select("output_video_url, user_id, project_id")
      .eq("id", exportRow.generation_id)
      .single();

    if (!generation?.output_video_url) {
      await admin
        .from("generation_exports")
        .update({ status: "failed", error_message: "Source render has no output video" })
        .eq("id", exportRow.id);
      return;
    }

    await admin.from("generation_exports").update({ status: "processing" }).eq("id", exportRow.id);

    try {
      const buffer = await cropToRatio(generation.output_video_url, exportRow.ratio);
      const path = buildStoragePath(
        generation.user_id,
        generation.project_id,
        `export-${exportRow.ratio.replace(":", "x")}.mp4`
      );
      await uploadBufferToStorage(RENDERED_VIDEOS_BUCKET, path, buffer, "video/mp4");

      await admin
        .from("generation_exports")
        .update({ status: "completed", video_url: path, completed_at: new Date().toISOString() })
        .eq("id", exportRow.id);

      logger.info("Ratio export complete", { id: exportRow.id, ratio: exportRow.ratio });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      await admin
        .from("generation_exports")
        .update({ status: "failed", error_message: message })
        .eq("id", exportRow.id);
      throw err;
    }
  },
});
