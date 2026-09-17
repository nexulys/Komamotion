"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getGenerationById, requireCurrentUser } from "@/lib/supabase/queries";
import { resolveMediaUrl, MANGA_SOURCES_BUCKET, RENDERED_VIDEOS_BUCKET } from "@/lib/supabase/signed-url";
import { getDefaultProvider, getVideoGenerationStatus } from "@/lib/ai";
import { estimateGenerationCostUsd } from "@/lib/ai/costs";
import {
  calculateAudioCreditsCost,
  calculateCreditsCost,
  calculateExportRatioCreditsCost,
  calculatePanelExtractionCreditsCost,
  calculateUpscaleCreditsCost,
} from "@/lib/stripe/credits";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { finalizeGenerationCompleted, finalizeGenerationFailed, refundCredits } from "@/lib/generation/pipeline";
import { generateVideoTask } from "@/trigger/generate-video";
import { postProcessGenerationTask } from "@/trigger/post-process-generation";
import { upscaleGenerationTask } from "@/trigger/upscale-generation";
import { generateAudioTask } from "@/trigger/generate-audio";
import { extractPanelsTask } from "@/trigger/extract-panels";
import { exportRatioTask } from "@/trigger/export-ratio";
import { batchGenerateTask, type BatchGenerateSettings } from "@/trigger/batch-generate";
import type { AnimationSettingsValue } from "@/components/animation-settings";
import type { ExportRatio, ExportStatus, GenerationRow } from "@/lib/supabase/types";

type ActionResult<T> = { data?: T; error?: string };

async function debitCredits(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  amount: number,
  description: string
): Promise<{ ok: boolean; balance: number }> {
  const { data: user } = await admin.from("users").select("credits_balance").eq("id", userId).single();
  const balance = user?.credits_balance ?? 0;
  if (balance < amount) return { ok: false, balance };

  await admin.from("users").update({ credits_balance: balance - amount }).eq("id", userId);
  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount: -amount,
    type: "generation_debit",
    description,
  });
  return { ok: true, balance: balance - amount };
}

export async function getGeneration(generationId: string): Promise<GenerationRow | null> {
  const { authUserId } = await requireCurrentUser();
  return getGenerationById(generationId, authUserId);
}

export async function startGeneration({
  projectId,
  sourceImagePath,
  settings,
}: {
  projectId: string;
  sourceImagePath: string;
  settings: AnimationSettingsValue & { removeText: boolean };
}): Promise<ActionResult<GenerationRow>> {
  const { authUserId } = await requireCurrentUser();

  try {
    await enforceRateLimit("generation", authUserId);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const creditsCost = calculateCreditsCost({
    durationSeconds: settings.durationSeconds,
    resolution: settings.resolution,
    colorize: settings.colorize,
    removeText: settings.removeText,
  });
  const provider = getDefaultProvider();
  const estimatedCostUsd = estimateGenerationCostUsd({
    provider,
    resolution: settings.resolution,
    durationSeconds: settings.durationSeconds,
    colorize: settings.colorize,
    removeText: settings.removeText,
  });

  const admin = createServiceRoleClient();
  const debit = await debitCredits(admin, authUserId, creditsCost, `Render for project ${projectId}`);
  if (!debit.ok) {
    return { error: `Not enough credits. This render needs ${creditsCost}, you have ${debit.balance}.` };
  }

  const { data: generation, error: insertError } = await admin
    .from("generations")
    .insert({
      project_id: projectId,
      user_id: authUserId,
      source_image_url: sourceImagePath,
      status: "pending",
      provider,
      prompt: settings.prompt || null,
      camera_movement: settings.cameraMovement,
      motion_intensity: settings.motionIntensity,
      fps: settings.fps,
      resolution: settings.resolution,
      colorize: settings.colorize,
      remove_text: settings.removeText,
      duration_seconds: settings.durationSeconds,
      credits_cost: creditsCost,
      estimated_cost_usd: estimatedCostUsd,
    })
    .select("*")
    .single();

  if (insertError || !generation) {
    await refundCredits(admin, {
      userId: authUserId,
      amount: creditsCost,
      description: "Refund — could not create generation row",
    });
    return { error: insertError?.message ?? "Could not create generation." };
  }

  await admin.from("projects").update({ status: "processing" }).eq("id", projectId);
  await generateVideoTask.trigger({ generationId: generation.id });

  revalidatePath(`/editor/${projectId}`);
  return { data: { ...generation, credits_cost: creditsCost } };
}

/**
 * Manual "check now" the client can call for extra responsiveness on top
 * of Realtime — the webhook (primary) and the reconciliation cron
 * (fallback) already keep the row up to date without this.
 */
export async function refreshGenerationStatus(generationId: string): Promise<ActionResult<GenerationRow>> {
  const { authUserId } = await requireCurrentUser();
  const supabase = await createClient();

  const { data: generation, error } = await supabase
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .eq("user_id", authUserId)
    .single();

  if (error || !generation) return { error: "Generation not found." };
  if (generation.status === "completed" || generation.status === "failed" || !generation.external_job_id) {
    return { data: generation };
  }

  const status = await getVideoGenerationStatus(generation.provider, generation.external_job_id);
  const admin = createServiceRoleClient();

  if (status.status === "completed") {
    const updated = await finalizeGenerationCompleted(
      generationId,
      { videoUrl: status.videoUrl, thumbnailUrl: status.thumbnailUrl },
      admin
    );
    await postProcessGenerationTask.trigger({ generationId });
    revalidatePath(`/editor/${generation.project_id}`);
    return { data: updated ?? generation };
  }

  if (status.status === "failed") {
    const updated = await finalizeGenerationFailed(generationId, status.error ?? "Generation failed", admin);
    revalidatePath(`/editor/${generation.project_id}`);
    return { data: updated ?? generation };
  }

  return { data: generation };
}

export async function requestUpscale(generationId: string): Promise<ActionResult<{ queued: true }>> {
  const { authUserId } = await requireCurrentUser();
  try {
    await enforceRateLimit("aiUtility", authUserId);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const admin = createServiceRoleClient();
  const { data: generation } = await admin
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .eq("user_id", authUserId)
    .single();

  if (!generation || generation.status !== "completed") {
    return { error: "Generation isn't ready to upscale yet." };
  }

  const creditsCost = calculateUpscaleCreditsCost(generation.duration_seconds);
  const debit = await debitCredits(admin, authUserId, creditsCost, `4K upscale for generation ${generationId}`);
  if (!debit.ok) return { error: `Not enough credits. Upscaling needs ${creditsCost}.` };

  await upscaleGenerationTask.trigger({ generationId, creditsCost });
  return { data: { queued: true } };
}

export async function requestAudio(generationId: string): Promise<ActionResult<{ queued: true }>> {
  const { authUserId } = await requireCurrentUser();
  try {
    await enforceRateLimit("aiUtility", authUserId);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const admin = createServiceRoleClient();
  const { data: generation } = await admin
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .eq("user_id", authUserId)
    .single();

  if (!generation || generation.status !== "completed") {
    return { error: "Generation isn't ready for audio yet." };
  }

  const creditsCost = calculateAudioCreditsCost(generation.duration_seconds);
  const debit = await debitCredits(admin, authUserId, creditsCost, `AI sound for generation ${generationId}`);
  if (!debit.ok) return { error: `Not enough credits. AI sound needs ${creditsCost}.` };

  await generateAudioTask.trigger({ generationId, creditsCost });
  return { data: { queued: true } };
}

export async function requestExportRatio(
  generationId: string,
  ratio: ExportRatio
): Promise<ActionResult<{ queued: true }>> {
  const { authUserId } = await requireCurrentUser();
  try {
    await enforceRateLimit("export", authUserId);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const admin = createServiceRoleClient();
  const { data: generation } = await admin
    .from("generations")
    .select("id, status")
    .eq("id", generationId)
    .eq("user_id", authUserId)
    .single();

  if (!generation || generation.status !== "completed") {
    return { error: "Generation isn't ready to export yet." };
  }

  const creditsCost = calculateExportRatioCreditsCost();
  const debit = await debitCredits(admin, authUserId, creditsCost, `${ratio} export for generation ${generationId}`);
  if (!debit.ok) return { error: `Not enough credits. Exporting needs ${creditsCost}.` };

  const { data: exportRow, error } = await admin
    .from("generation_exports")
    .upsert(
      { generation_id: generationId, user_id: authUserId, ratio, status: "pending" },
      { onConflict: "generation_id,ratio" }
    )
    .select("id")
    .single();

  if (error || !exportRow) {
    await refundCredits(admin, { userId: authUserId, amount: creditsCost, description: "Refund — export row failed" });
    return { error: error?.message ?? "Could not queue export." };
  }

  await exportRatioTask.trigger({ generationExportId: exportRow.id });
  return { data: { queued: true } };
}

export async function requestPanelExtraction(
  projectId: string,
  sourcePagePath: string
): Promise<ActionResult<{ panelExtractionId: string }>> {
  const { authUserId } = await requireCurrentUser();
  try {
    await enforceRateLimit("aiUtility", authUserId);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const admin = createServiceRoleClient();
  const creditsCost = calculatePanelExtractionCreditsCost();
  const debit = await debitCredits(admin, authUserId, creditsCost, `Panel split for project ${projectId}`);
  if (!debit.ok) return { error: `Not enough credits. Splitting a page needs ${creditsCost}.` };

  const { data: extraction, error } = await admin
    .from("panel_extractions")
    .insert({ project_id: projectId, user_id: authUserId, source_page_url: sourcePagePath })
    .select("id")
    .single();

  if (error || !extraction) {
    await refundCredits(admin, { userId: authUserId, amount: creditsCost, description: "Refund — extraction row failed" });
    return { error: error?.message ?? "Could not queue panel extraction." };
  }

  await extractPanelsTask.trigger({ panelExtractionId: extraction.id });
  return { data: { panelExtractionId: extraction.id } };
}

export async function getPanelExtractionResult(panelExtractionId: string): Promise<{
  status: ExportStatus;
  panels: { path: string; url: string }[];
  errorMessage: string | null;
} | null> {
  const { authUserId } = await requireCurrentUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("panel_extractions")
    .select("*")
    .eq("id", panelExtractionId)
    .eq("user_id", authUserId)
    .single();

  if (!data) return null;

  const resolved = await Promise.all(
    data.panel_urls.map(async (path) => ({ path, url: await resolveMediaUrl(MANGA_SOURCES_BUCKET, path) }))
  );

  return {
    status: data.status,
    panels: resolved.filter((p): p is { path: string; url: string } => Boolean(p.url)),
    errorMessage: data.error_message,
  };
}

export async function getGenerationExports(generationId: string) {
  const { authUserId } = await requireCurrentUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("generation_exports")
    .select("*")
    .eq("generation_id", generationId)
    .eq("user_id", authUserId);

  if (!data) return [];

  return Promise.all(
    data.map(async (row) => ({
      ...row,
      video_url: await resolveMediaUrl(RENDERED_VIDEOS_BUCKET, row.video_url),
    }))
  );
}

export async function startBatchGeneration({
  projectId,
  sourceImagePaths,
  settings,
}: {
  projectId: string;
  sourceImagePaths: string[];
  settings: BatchGenerateSettings;
}): Promise<ActionResult<{ batchId: string }>> {
  const { authUserId } = await requireCurrentUser();
  try {
    await enforceRateLimit("generation", authUserId);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  if (sourceImagePaths.length === 0) return { error: "No panels to generate." };

  const batchId = crypto.randomUUID();
  await batchGenerateTask.trigger({
    batchId,
    projectId,
    userId: authUserId,
    sourceImagePaths,
    settings,
  });

  revalidatePath(`/editor/${projectId}`);
  return { data: { batchId } };
}
