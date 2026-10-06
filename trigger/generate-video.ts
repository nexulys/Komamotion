import { logger, task } from "@trigger.dev/sdk";
import { createVideoGeneration } from "@/lib/ai";
import { removeTextFromPanel } from "@/lib/ai/inpainting";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MANGA_SOURCES_BUCKET, createSignedUrl } from "@/lib/supabase/signed-url";
import { getAiWebhookUrl } from "@/lib/env";
import { finalizeGenerationFailed, setGenerationProgress } from "@/lib/generation/pipeline";

/**
 * Orchestrates one image-to-video render: optional text/bubble cleanup,
 * then submission to the fal.ai/Replicate queue. The provider notifies us
 * of completion via its webhook (/api/webhooks/ai, signature-verified);
 * a cron reconciliation task (reconcile-stuck-generations.ts) covers the
 * rare case a webhook is dropped. Runs as a durable Trigger.dev task
 * instead of inline in the server action so inpainting + submission never
 * risk an HTTP timeout, and so both steps get automatic retry.
 */
export const generateVideoTask = task({
  id: "generate-video",
  retry: { maxAttempts: 3, minTimeoutInMs: 3000, maxTimeoutInMs: 30_000, factor: 2 },
  run: async (payload: { generationId: string }) => {
    const admin = createServiceRoleClient();

    const { data: generation } = await admin
      .from("generations")
      .select("*")
      .eq("id", payload.generationId)
      .single();

    if (!generation) {
      logger.error("Generation not found", { generationId: payload.generationId });
      return;
    }

    // Idempotency guard: a retried attempt (or a stray duplicate trigger)
    // should never re-submit a job that's already past this stage.
    if (generation.status !== "pending") {
      logger.info("Generation already in progress, skipping re-submission", {
        generationId: generation.id,
        status: generation.status,
      });
      return;
    }

    await setGenerationProgress(generation.id, 10, { status: "processing" }, admin);

    let imageUrl = await createSignedUrl(MANGA_SOURCES_BUCKET, generation.source_image_url);

    if (generation.remove_text) {
      try {
        const { cleanedImageUrl, regionsRemoved } = await removeTextFromPanel(imageUrl);
        logger.info("Inpainting complete", { generationId: generation.id, regionsRemoved });
        await admin
          .from("generations")
          .update({ cleaned_image_url: cleanedImageUrl })
          .eq("id", generation.id);
        imageUrl = cleanedImageUrl;
      } catch (err) {
        // Non-fatal: ship the animation from the original panel rather
        // than failing the whole render over a cleanup step.
        logger.warn("Inpainting failed, continuing with original panel", {
          generationId: generation.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await setGenerationProgress(generation.id, 30, {}, admin);

    try {
      const job = await createVideoGeneration(
        {
          imageUrl,
          prompt: generation.prompt,
          cameraMovement: generation.camera_movement,
          motionIntensity: generation.motion_intensity,
          fps: generation.fps,
          resolution: generation.resolution,
          durationSeconds: generation.duration_seconds,
          colorize: generation.colorize,
          webhookUrl: getAiWebhookUrl(),
        },
        generation.provider
      );

      await admin
        .from("generations")
        .update({ external_job_id: job.externalJobId, provider: job.provider, progress: 50 })
        .eq("id", generation.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit render job";
      logger.error("Provider submission failed", { generationId: generation.id, error: message });
      await finalizeGenerationFailed(generation.id, message, admin);
    }
  },
});
