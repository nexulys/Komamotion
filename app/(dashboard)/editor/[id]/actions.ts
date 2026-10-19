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
import {
  claimEnhancement,
  deductCredits,
  failEnhancement,
  failExport,
  failPanelExtraction,
  finalizeGenerationCompleted,
  finalizeGenerationFailed,
  getCreditsBalance,
  refundCredits,
  releaseEnhancement,
} from "@/lib/generation/pipeline";
import { getEnhancementState, type EnhancementKind } from "@/lib/generation/enhancement-status";
import { normalizeRenderSettings } from "@/lib/ai/render-options";
import { lockedRenderFeature, planAllows, queuePriorityFor, upgradeMessage } from "@/lib/stripe/plans";
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

// The service-role client bypasses RLS, so every action that takes a project
// id or a storage path from the browser checks ownership itself.
async function ownsProject(admin: ReturnType<typeof createServiceRoleClient>, projectId: string, userId: string) {
  const { data } = await admin.from("projects").select("id").eq("id", projectId).eq("user_id", userId).maybeSingle();
  return data !== null;
}

/** Uploads and extracted panels live under `${userId}/…` in the manga-sources bucket. */
function isOwnSourcePath(path: string, userId: string) {
  return path.startsWith(`${userId}/`) && !path.split("/").includes("..");
}

const NOT_YOUR_PROJECT = "Project not found.";
const NOT_YOUR_PANEL = "This panel can't be used — re-upload it and try again.";

async function debitCredits(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  amount: number,
  description: string
): Promise<{ ok: boolean; balance: number }> {
  const ok = await deductCredits(admin, { userId, amount, description });
  if (ok) return { ok: true, balance: 0 };
  // Only read back on failure, purely for the error message.
  return { ok: false, balance: await getCreditsBalance(admin, userId) };
}

export async function getGeneration(generationId: string): Promise<GenerationRow | null> {
  const { authUserId } = await requireCurrentUser();
  return getGenerationById(generationId, authUserId);
}

export async function startGeneration({
  projectId,
  sourceImagePath,
  settings: requestedSettings,
}: {
  projectId: string;
  sourceImagePath: string;
  settings: AnimationSettingsValue & { removeText: boolean };
}): Promise<ActionResult<GenerationRow>> {
  const { authUserId, profile } = await requireCurrentUser();
  if (!isOwnSourcePath(sourceImagePath, authUserId)) return { error: NOT_YOUR_PANEL };
  // Price and render only values the model accepts, whatever the browser sent.
  const settings = normalizeRenderSettings(requestedSettings);
  const locked = lockedRenderFeature(profile?.plan, settings);
  if (locked) return { error: upgradeMessage(locked) };

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
  if (!(await ownsProject(admin, projectId, authUserId))) return { error: NOT_YOUR_PROJECT };
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

  try {
    await generateVideoTask.trigger({ generationId: generation.id }, { priority: queuePriorityFor(profile?.plan) });
  } catch (err) {
    console.error("[editor] could not queue render", generation.id, err);
    await finalizeGenerationFailed(generation.id, "Could not start the render. Your credits were refunded.", admin);
    return { error: "Could not start the render. Your credits were refunded." };
  }
  await admin.from("projects").update({ status: "processing" }).eq("id", projectId);

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
    try {
      const { generation: updated, transitioned } = await finalizeGenerationCompleted(
        generationId,
        { videoUrl: status.videoUrl, thumbnailUrl: status.thumbnailUrl },
        admin
      );
      if (transitioned) {
        await postProcessGenerationTask.trigger({ generationId });
      }
      revalidatePath(`/editor/${generation.project_id}`);
      return { data: updated ?? generation };
    } catch {
      // Persisting the render failed; it stays "processing" and the
      // webhook retry / reconciliation cron will finish it.
      return { data: generation };
    }
  }

  if (status.status === "failed") {
    const updated = await finalizeGenerationFailed(generationId, status.error ?? "Generation failed", admin);
    revalidatePath(`/editor/${generation.project_id}`);
    return { data: updated ?? generation };
  }

  return { data: generation };
}

const ENHANCEMENTS = {
  upscale: {
    label: "4K upscale",
    notReady: "Generation isn't ready to upscale yet.",
    alreadyRunning: "A 4K upscale is already running for this render.",
    notEnoughCredits: (cost: number) => `Not enough credits. Upscaling needs ${cost}.`,
    creditsCost: calculateUpscaleCreditsCost,
    task: upscaleGenerationTask,
  },
  audio: {
    label: "AI sound",
    notReady: "Generation isn't ready for audio yet.",
    alreadyRunning: "AI sound is already being generated for this render.",
    notEnoughCredits: (cost: number) => `Not enough credits. AI sound needs ${cost}.`,
    creditsCost: calculateAudioCreditsCost,
    task: generateAudioTask,
  },
} as const;

/**
 * Shared flow for the on-demand 4K upscale / AI sound jobs: claim the job on
 * the generation row first (so a double click can't be charged twice), then
 * debit, then queue. Every exit after the claim leaves the row and the
 * balance consistent: refused debit → claim released; queueing failure →
 * refund + status failed.
 */
async function requestEnhancement(
  kind: EnhancementKind,
  generationId: string
): Promise<ActionResult<{ queued: true; creditsBalance: number }>> {
  const config = ENHANCEMENTS[kind];
  const { authUserId, profile } = await requireCurrentUser();
  if (kind === "upscale" && !planAllows(profile?.plan, "upscale")) return { error: upgradeMessage("upscale") };
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
    return { error: config.notReady };
  }

  const previous = getEnhancementState(generation, kind);
  const claimed = await claimEnhancement(admin, { generationId, userId: authUserId, kind });
  if (!claimed) return { error: config.alreadyRunning };

  const creditsCost = config.creditsCost(generation.duration_seconds);
  const debit = await debitCredits(admin, authUserId, creditsCost, `${config.label} for generation ${generationId}`);
  if (!debit.ok) {
    await releaseEnhancement(admin, { generationId, kind, previous });
    return { error: config.notEnoughCredits(creditsCost) };
  }

  try {
    await config.task.trigger({ generationId, creditsCost });
  } catch (err) {
    console.error(`[editor] could not queue ${kind}`, err);
    await failEnhancement(admin, {
      generationId,
      userId: authUserId,
      kind,
      creditsCost,
      description: `Refund — ${config.label} could not be queued`,
    });
    return { error: `Could not start the ${config.label}. Your credits were refunded.` };
  }

  return { data: { queued: true, creditsBalance: await getCreditsBalance(admin, authUserId) } };
}

export async function requestUpscale(generationId: string) {
  return requestEnhancement("upscale", generationId);
}

export async function requestAudio(generationId: string) {
  return requestEnhancement("audio", generationId);
}

export async function getMyCreditsBalance(): Promise<number> {
  const { authUserId } = await requireCurrentUser();
  return getCreditsBalance(createServiceRoleClient(), authUserId);
}

export async function requestExportRatio(
  generationId: string,
  ratio: ExportRatio
): Promise<ActionResult<{ queued: true; creditsBalance: number }>> {
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

  try {
    await exportRatioTask.trigger({ generationExportId: exportRow.id, creditsCost });
  } catch (err) {
    console.error("[editor] could not queue export", exportRow.id, err);
    await failExport(admin, { exportId: exportRow.id, creditsCost, message: "Could not be queued" });
    return { error: "Could not start the export. Your credits were refunded." };
  }
  return { data: { queued: true, creditsBalance: await getCreditsBalance(admin, authUserId) } };
}

export async function requestPanelExtraction(
  projectId: string,
  sourcePagePath: string
): Promise<ActionResult<{ panelExtractionId: string; creditsBalance: number }>> {
  const { authUserId } = await requireCurrentUser();
  if (!isOwnSourcePath(sourcePagePath, authUserId)) return { error: NOT_YOUR_PANEL };
  try {
    await enforceRateLimit("aiUtility", authUserId);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const admin = createServiceRoleClient();
  if (!(await ownsProject(admin, projectId, authUserId))) return { error: NOT_YOUR_PROJECT };
  const creditsCost = calculatePanelExtractionCreditsCost();
  const debit = await debitCredits(admin, authUserId, creditsCost, `Panel split for project ${projectId}`);
  if (!debit.ok) return { error: `Not enough credits. Splitting a page needs ${creditsCost}.` };

  const { data: extraction, error } = await admin
    .from("panel_extractions")
    .insert({ project_id: projectId, user_id: authUserId, source_page_url: sourcePagePath, status: "pending" })
    .select("id")
    .single();

  if (error || !extraction) {
    await refundCredits(admin, { userId: authUserId, amount: creditsCost, description: "Refund — extraction row failed" });
    return { error: error?.message ?? "Could not queue panel extraction." };
  }

  try {
    await extractPanelsTask.trigger({ panelExtractionId: extraction.id, creditsCost });
  } catch (err) {
    console.error("[editor] could not queue panel extraction", extraction.id, err);
    await failPanelExtraction(admin, { extractionId: extraction.id, creditsCost, message: "Could not be queued" });
    return { error: "Could not start splitting this page. Your credits were refunded." };
  }
  return {
    data: { panelExtractionId: extraction.id, creditsBalance: await getCreditsBalance(admin, authUserId) },
  };
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
  settings: requestedSettings,
}: {
  projectId: string;
  sourceImagePaths: string[];
  settings: BatchGenerateSettings;
}): Promise<ActionResult<{ batchId: string }>> {
  const { authUserId, profile } = await requireCurrentUser();
  try {
    await enforceRateLimit("generation", authUserId);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  if (!planAllows(profile?.plan, "batch")) return { error: upgradeMessage("batch") };
  if (sourceImagePaths.length === 0) return { error: "No panels to generate." };
  if (!sourceImagePaths.every((path) => isOwnSourcePath(path, authUserId))) return { error: NOT_YOUR_PANEL };
  if (!(await ownsProject(createServiceRoleClient(), projectId, authUserId))) return { error: NOT_YOUR_PROJECT };

  const settings = normalizeRenderSettings(requestedSettings);
  const locked = lockedRenderFeature(profile?.plan, settings);
  if (locked) return { error: upgradeMessage(locked) };
  const batchId = crypto.randomUUID();
  try {
    // Credits are debited per panel inside the task, so a failure here costs nothing.
    await batchGenerateTask.trigger({
      batchId,
      projectId,
      userId: authUserId,
      sourceImagePaths,
      settings,
      priority: queuePriorityFor(profile?.plan),
    });
  } catch (err) {
    console.error("[editor] could not queue batch", batchId, err);
    return { error: "Could not start the batch render. No credits were used." };
  }

  revalidatePath(`/editor/${projectId}`);
  return { data: { batchId } };
}
