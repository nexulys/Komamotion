import { logger, task } from "@trigger.dev/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { calculateCreditsCost } from "@/lib/stripe/credits";
import { getDefaultProvider } from "@/lib/ai";
import { DEFAULT_VIDEO_MODEL } from "@/lib/ai/video-models";
import { estimateGenerationCostUsd } from "@/lib/ai/costs";
import { deductCredits, finalizeGenerationFailed, refundCredits } from "@/lib/generation/pipeline";
import type { CameraMovement, Resolution } from "@/lib/supabase/types";
import { generateVideoTask } from "@/trigger/generate-video";

export interface BatchGenerateSettings {
  prompt: string;
  cameraMovement: CameraMovement;
  motionIntensity: number;
  fps: number;
  resolution: Resolution;
  colorize: boolean;
  removeText: boolean;
  durationSeconds: number;
}

/**
 * Whole-chapter batch processing: creates one `generations` row per
 * uploaded panel (shared settings, tagged with a common batch_id) and
 * fans the actual renders out via Trigger.dev's batchTrigger, so a
 * 20-page chapter queues in one call instead of 20 round-trips. Stops
 * early (rather than partially failing later) if the user's balance runs
 * out mid-batch.
 */
export const batchGenerateTask = task({
  id: "batch-generate",
  retry: { maxAttempts: 1 },
  run: async (payload: {
    batchId: string;
    projectId: string;
    userId: string;
    sourceImagePaths: string[];
    settings: BatchGenerateSettings;
    /** Trigger.dev priority for the renders, from the user's plan. */
    priority?: number;
  }) => {
    const admin = createServiceRoleClient();
    const provider = getDefaultProvider();
    const creditsPerItem = calculateCreditsCost({
      durationSeconds: payload.settings.durationSeconds,
      resolution: payload.settings.resolution,
      colorize: payload.settings.colorize,
      removeText: payload.settings.removeText,
    });
    const estimatedCostUsd = estimateGenerationCostUsd({
      provider,
      resolution: payload.settings.resolution,
      durationSeconds: payload.settings.durationSeconds,
      colorize: payload.settings.colorize,
      removeText: payload.settings.removeText,
    });

    const createdIds: string[] = [];

    for (const sourceImagePath of payload.sourceImagePaths) {
      const debited = await deductCredits(admin, {
        userId: payload.userId,
        amount: creditsPerItem,
        description: `Batch render (${payload.batchId})`,
      });

      if (!debited) {
        logger.warn("Batch stopped early: insufficient credits", {
          batchId: payload.batchId,
          completed: createdIds.length,
          total: payload.sourceImagePaths.length,
        });
        break;
      }

      const { data: generation, error } = await admin
        .from("generations")
        .insert({
          project_id: payload.projectId,
          user_id: payload.userId,
          source_image_url: sourceImagePath,
          status: "pending",
          provider,
          model: DEFAULT_VIDEO_MODEL,
          prompt: payload.settings.prompt || null,
          camera_movement: payload.settings.cameraMovement,
          motion_intensity: payload.settings.motionIntensity,
          fps: payload.settings.fps,
          resolution: payload.settings.resolution,
          colorize: payload.settings.colorize,
          remove_text: payload.settings.removeText,
          duration_seconds: payload.settings.durationSeconds,
          credits_cost: creditsPerItem,
          estimated_cost_usd: estimatedCostUsd,
          batch_id: payload.batchId,
        })
        .select("id")
        .single();

      if (error || !generation) {
        logger.error("Failed to create batch generation row", { error: error?.message });
        await refundCredits(admin, {
          userId: payload.userId,
          amount: creditsPerItem,
          description: `Refund — batch row could not be created (${payload.batchId})`,
        });
        continue;
      }

      createdIds.push(generation.id);
    }

    if (createdIds.length > 0) {
      try {
        await generateVideoTask.batchTrigger(
          createdIds.map((generationId) => ({ payload: { generationId }, options: { priority: payload.priority ?? 0 } }))
        );
      } catch (err) {
        // The rows are debited but will never render: fail + refund each one now.
        logger.error("Could not queue batch renders", { batchId: payload.batchId, error: err instanceof Error ? err.message : String(err) });
        for (const id of createdIds) {
          await finalizeGenerationFailed(id, "The batch render could not be started. Your credits were refunded.", admin);
        }
        return { queued: 0, requested: payload.sourceImagePaths.length };
      }
      await admin.from("projects").update({ status: "processing" }).eq("id", payload.projectId);
    }

    return { queued: createdIds.length, requested: payload.sourceImagePaths.length };
  },
});
