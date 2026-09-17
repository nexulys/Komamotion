import { logger, task } from "@trigger.dev/sdk";
import { extractPanelsFromPage } from "@/lib/ai/panel-extraction";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MANGA_SOURCES_BUCKET, createSignedUrl } from "@/lib/supabase/signed-url";

export const extractPanelsTask = task({
  id: "extract-panels",
  retry: { maxAttempts: 3, minTimeoutInMs: 3000, maxTimeoutInMs: 30_000, factor: 2 },
  run: async (payload: { panelExtractionId: string }) => {
    const admin = createServiceRoleClient();

    const { data: extraction } = await admin
      .from("panel_extractions")
      .select("*")
      .eq("id", payload.panelExtractionId)
      .single();

    if (!extraction) {
      logger.error("Panel extraction not found", { id: payload.panelExtractionId });
      return;
    }

    await admin
      .from("panel_extractions")
      .update({ status: "processing" })
      .eq("id", extraction.id);

    try {
      const signedPageUrl = await createSignedUrl(MANGA_SOURCES_BUCKET, extraction.source_page_url);
      const { panelPaths } = await extractPanelsFromPage({
        pageImageUrl: signedPageUrl,
        userId: extraction.user_id,
        projectId: extraction.project_id,
      });

      await admin
        .from("panel_extractions")
        .update({ status: "completed", panel_urls: panelPaths, completed_at: new Date().toISOString() })
        .eq("id", extraction.id);

      logger.info("Panel extraction complete", { id: extraction.id, count: panelPaths.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Panel extraction failed";
      await admin
        .from("panel_extractions")
        .update({ status: "failed", error_message: message })
        .eq("id", extraction.id);
      throw err;
    }
  },
});
