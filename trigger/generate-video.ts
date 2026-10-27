import { logger, task } from "@trigger.dev/sdk";
import { createVideoGeneration } from "@/lib/ai";
import { removeTextFromPanel } from "@/lib/ai/inpainting";
import { colorizePanel } from "@/lib/ai/colorize";
import { assertImageAllowed, ContentRejectedError } from "@/lib/ai/moderation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MANGA_SOURCES_BUCKET, createSignedUrl } from "@/lib/supabase/signed-url";
import { getAiWebhookUrl } from "@/lib/env";
import { finalizeGenerationFailed, refundOptionSurcharge, setGenerationProgress } from "@/lib/generation/pipeline";

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

    // Nothing goes to an AI model before passing moderation.
    try {
      await assertImageAllowed(imageUrl);
    } catch (err) {
      if (err instanceof ContentRejectedError) {
        logger.warn("Source image rejected by moderation", { generationId: generation.id, probability: err.probability });
        await finalizeGenerationFailed(generation.id, err.message, admin);
        return;
      }
      throw err;
    }
    // What the user is still charged for: an optional step that fails is
    // dropped from it and its surcharge refunded.
    const charged = { ...generation };

    // Optional pre-processing. A failed step is non-fatal — the panel is
    // animated without it and that option's surcharge is refunded — rather
    // than failing the whole render over a cleanup step.
    if (generation.remove_text) {
      try {
        const { cleanedImageUrl, regionsRemoved } = await removeTextFromPanel(imageUrl);
        logger.info("Inpainting complete", { generationId: generation.id, regionsRemoved });
        imageUrl = cleanedImageUrl;
      } catch (err) {
        logger.warn("Inpainting failed, continuing with original panel", {
          generationId: generation.id,
          error: err instanceof Error ? err.message : String(err),
        });
        Object.assign(charged, await refundOptionSurcharge(admin, charged, "removeText"));
      }
    }

    if (generation.colorize) {
      try {
        imageUrl = await colorizePanel(imageUrl);
        logger.info("Colorization complete", { generationId: generation.id });
      } catch (err) {
        logger.warn("Colorization failed, continuing in black and white", {
          generationId: generation.id,
          error: err instanceof Error ? err.message : String(err),
        });
        Object.assign(charged, await refundOptionSurcharge(admin, charged, "colorize"));
      }
    }

    if (generation.remove_text || generation.colorize) {
      await admin.from("generations").update({ cleaned_image_url: imageUrl }).eq("id", generation.id);
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
          model: generation.model,
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
  // Anything that throws before submission (e.g. the source image can't be
  // signed) lands here once retries run out: fail the row and refund.
  onFailure: async ({ payload, error }) => {
    await finalizeGenerationFailed(
      payload.generationId,
      error instanceof Error ? error.message : "The render could not be started",
      createServiceRoleClient()
    );
  },
});
