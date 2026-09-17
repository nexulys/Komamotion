import { logger, schedules } from "@trigger.dev/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getVideoGenerationStatus } from "@/lib/ai";
import { finalizeGenerationCompleted, finalizeGenerationFailed } from "@/lib/generation/pipeline";
import { postProcessGenerationTask } from "@/trigger/post-process-generation";
import type { AiProvider } from "@/lib/supabase/types";

const STUCK_AFTER_MINUTES = 10;
const TIMEOUT_AFTER_MINUTES = 30;
const BATCH_LIMIT = 25;

/**
 * Safety net for the primary webhook-driven completion path: every 5
 * minutes, re-checks any generation that's been "processing" with a
 * provider job for too long without an update — covers a dropped/failed
 * webhook delivery. Generations that have been stuck past a hard timeout
 * are marked failed and refunded rather than left to poll forever.
 */
export const reconcileStuckGenerationsTask = schedules.task({
  id: "reconcile-stuck-generations",
  cron: "*/5 * * * *",
  run: async () => {
    const admin = createServiceRoleClient();
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MINUTES * 60_000).toISOString();
    const timeoutBefore = new Date(Date.now() - TIMEOUT_AFTER_MINUTES * 60_000).toISOString();

    const { data: stuck } = await admin
      .from("generations")
      .select("*")
      .eq("status", "processing")
      .not("external_job_id", "is", null)
      .lt("updated_at", stuckBefore)
      .limit(BATCH_LIMIT);

    if (!stuck || stuck.length === 0) return { checked: 0 };

    let resolved = 0;
    for (const generation of stuck) {
      if (generation.updated_at < timeoutBefore) {
        await finalizeGenerationFailed(generation.id, "Render timed out waiting on the AI provider", admin);
        resolved++;
        continue;
      }

      const status = await getVideoGenerationStatus(
        generation.provider as AiProvider,
        generation.external_job_id!
      );

      if (status.status === "completed") {
        await finalizeGenerationCompleted(
          generation.id,
          { videoUrl: status.videoUrl, thumbnailUrl: status.thumbnailUrl },
          admin
        );
        await postProcessGenerationTask.trigger({ generationId: generation.id });
        resolved++;
      } else if (status.status === "failed") {
        await finalizeGenerationFailed(generation.id, status.error ?? "Generation failed", admin);
        resolved++;
      }
    }

    logger.info("Reconciliation pass complete", { checked: stuck.length, resolved });
    return { checked: stuck.length, resolved };
  },
});
