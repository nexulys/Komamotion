import { logger, schedules } from "@trigger.dev/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getVideoGenerationStatus } from "@/lib/ai";
import { finalizeGenerationCompleted, finalizeGenerationFailed } from "@/lib/generation/pipeline";
import { postProcessGenerationTask } from "@/trigger/post-process-generation";
import type { AiProvider } from "@/lib/supabase/types";

const STUCK_AFTER_MINUTES = 10;
const TIMEOUT_AFTER_MINUTES = 30;
const BATCH_LIMIT = 25;
// generate-video retries for a few minutes at most before submission; a row
// still without a provider job after this long will never get one.
const NEVER_SUBMITTED_AFTER_MINUTES = 30;
// post-process normally lands within a minute; past this, assume its run was lost.
// Its own onFailure fails + refunds a run that keeps erroring, so this only
// re-queues lost runs — bounded to the last few hours as a backstop.
const UNFINALIZED_AFTER_MINUTES = 15;
const UNFINALIZED_GIVE_UP_HOURS = 6;

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

    const neverSubmitted = await failNeverSubmitted(admin);
    const refinalized = await retriggerUnfinalized(admin);

    const { data: stuck } = await admin
      .from("generations")
      .select("*")
      .eq("status", "processing")
      .not("external_job_id", "is", null)
      .lt("updated_at", stuckBefore)
      .limit(BATCH_LIMIT);

    if (!stuck || stuck.length === 0) return { checked: 0, neverSubmitted, refinalized };

    let resolved = 0;
    for (const generation of stuck) {
      try {
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
          const { transitioned } = await finalizeGenerationCompleted(
            generation.id,
            { videoUrl: status.videoUrl, thumbnailUrl: status.thumbnailUrl },
            admin
          );
          if (transitioned) {
            await postProcessGenerationTask.trigger({ generationId: generation.id });
          }
          resolved++;
        } else if (status.status === "failed") {
          await finalizeGenerationFailed(generation.id, status.error ?? "Generation failed", admin);
          resolved++;
        }
      } catch (err) {
        // One failing item (e.g. a persistence download error) must not
        // abort the pass for the rest; it gets retried on the next run.
        logger.error("Reconciliation failed for generation", {
          generationId: generation.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("Reconciliation pass complete", { checked: stuck.length, resolved, neverSubmitted, refinalized });
    return { checked: stuck.length, resolved, neverSubmitted, refinalized };
  },
});

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/** Renders that never reached the AI provider (queue lost, task crashed before submitting): fail + refund. */
async function failNeverSubmitted(admin: ServiceClient) {
  const before = new Date(Date.now() - NEVER_SUBMITTED_AFTER_MINUTES * 60_000).toISOString();
  const { data: rows } = await admin
    .from("generations")
    .select("id")
    .in("status", ["pending", "processing"])
    .is("external_job_id", null)
    .lt("updated_at", before)
    .limit(BATCH_LIMIT);

  for (const row of rows ?? []) {
    await finalizeGenerationFailed(row.id, "The render could not be started. Your credits were refunded.", admin);
  }
  return rows?.length ?? 0;
}

/** Completed renders whose post-process (watermark / finalize) never landed: run it again (it's idempotent). */
async function retriggerUnfinalized(admin: ServiceClient) {
  const before = new Date(Date.now() - UNFINALIZED_AFTER_MINUTES * 60_000).toISOString();
  const after = new Date(Date.now() - UNFINALIZED_GIVE_UP_HOURS * 3_600_000).toISOString();
  const { data: rows } = await admin
    .from("generations")
    .select("id")
    .eq("status", "completed")
    .lt("progress", 100)
    .lt("updated_at", before)
    .gt("updated_at", after)
    .limit(BATCH_LIMIT);

  for (const row of rows ?? []) {
    try {
      await postProcessGenerationTask.trigger({ generationId: row.id });
    } catch (err) {
      logger.error("Could not re-trigger post-process", {
        generationId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return rows?.length ?? 0;
}
