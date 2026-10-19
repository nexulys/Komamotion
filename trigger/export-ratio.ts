import { logger, task } from "@trigger.dev/sdk";
import { cropToRatio } from "@/lib/media/ffmpeg";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  RENDERED_VIDEOS_BUCKET,
  buildStoragePath,
  resolveMediaUrl,
  uploadBufferToStorage,
} from "@/lib/supabase/signed-url";
import { failExport } from "@/lib/generation/pipeline";

type ExportPayload = { generationExportId: string; creditsCost: number };

/** Crops a completed render to a channel-specific aspect ratio (16:9 / 9:16 / 1:1) on demand. */
export const exportRatioTask = task({
  id: "export-ratio",
  retry: { maxAttempts: 3, minTimeoutInMs: 3000, maxTimeoutInMs: 30_000, factor: 2 },
  run: async (payload: ExportPayload) => {
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
      await failExport(admin, {
        exportId: exportRow.id,
        creditsCost: payload.creditsCost,
        message: "Source render has no output video",
      });
      return;
    }

    await admin.from("generation_exports").update({ status: "processing" }).eq("id", exportRow.id);

    try {
      const sourceUrl = await resolveMediaUrl(RENDERED_VIDEOS_BUCKET, generation.output_video_url);
      if (!sourceUrl) throw new Error("Could not resolve the rendered video for export");
      const buffer = await cropToRatio(sourceUrl, exportRow.ratio);
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
      // Rethrow so Trigger.dev retries; onFailure flags + refunds once retries run out.
      logger.warn("Ratio export attempt failed", { id: exportRow.id, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },
  onFailure: async ({ payload, error }) => {
    await failExport(createServiceRoleClient(), {
      exportId: payload.generationExportId,
      creditsCost: payload.creditsCost,
      message: error instanceof Error ? error.message : "Export failed",
    });
  },
});
