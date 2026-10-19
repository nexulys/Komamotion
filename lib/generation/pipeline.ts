import { createServiceRoleClient } from "@/lib/supabase/server";
import { RENDERED_VIDEOS_BUCKET, uploadBufferToStorage } from "@/lib/supabase/signed-url";
import {
  ENHANCEMENT_STALE_AFTER_MS,
  enhancementPatch,
  type EnhancementKind,
  type EnhancementState,
} from "@/lib/generation/enhancement-status";
import { calculateCreditsCost } from "@/lib/stripe/credits";
import type { CreditTransactionType, GenerationRow, GenerationStatus } from "@/lib/supabase/types";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

const NON_TERMINAL_STATUSES: GenerationStatus[] = ["pending", "processing"];

// ============================================================
// Credits — every balance change goes through the row-locking RPCs in
// migration 0003, never a JS read followed by a write.
// ============================================================

export async function deductCredits(
  admin: ServiceClient,
  {
    userId,
    amount,
    description,
    generationId,
  }: { userId: string; amount: number; description: string; generationId?: string }
): Promise<boolean> {
  const { data: ok, error } = await admin.rpc("deduct_user_credits", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) throw error;
  if (!ok) return false;

  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount: -amount,
    type: "generation_debit",
    description,
    generation_id: generationId,
  });
  return true;
}

/** Adds credits atomically. The ledger row is the caller's job when it doubles as an idempotency key (Stripe). */
export async function addCreditsToBalance(admin: ServiceClient, userId: string, amount: number) {
  const { error } = await admin.rpc("add_user_credits", { p_user_id: userId, p_amount: amount });
  if (error) throw error;
}

export async function grantCredits(
  admin: ServiceClient,
  {
    userId,
    amount,
    type,
    description,
    generationId,
  }: {
    userId: string;
    amount: number;
    type: CreditTransactionType;
    description: string;
    generationId?: string;
  }
) {
  if (amount <= 0) return;
  await addCreditsToBalance(admin, userId, amount);
  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount,
    type,
    description,
    generation_id: generationId,
  });
}

export async function refundCredits(
  admin: ServiceClient,
  {
    userId,
    amount,
    generationId,
    description,
  }: { userId: string; amount: number; generationId?: string; description: string }
) {
  await grantCredits(admin, { userId, amount, type: "refund", description, generationId });
}

export async function getCreditsBalance(admin: ServiceClient, userId: string) {
  const { data } = await admin.from("users").select("credits_balance").eq("id", userId).single();
  return data?.credits_balance ?? 0;
}

// ============================================================
// On-demand 4K upscale / AI sound jobs — status lives on the generation row
// (migration 0005) so the editor sees failures live and after a reload.
// ============================================================

/**
 * Marks the job as running in a single conditional update, so two clicks
 * racing each other can't both get through (and both be charged). Fails
 * only while a non-stale job is already running.
 */
export async function claimEnhancement(
  admin: ServiceClient,
  { generationId, userId, kind }: { generationId: string; userId: string; kind: EnhancementKind }
): Promise<boolean> {
  const now = Date.now();
  const staleBefore = new Date(now - ENHANCEMENT_STALE_AFTER_MS).toISOString();
  const { data, error } = await admin
    .from("generations")
    .update(enhancementPatch(kind, "processing", new Date(now).toISOString()))
    .eq("id", generationId)
    .eq("user_id", userId)
    .or(
      [
        `${kind}_status.is.null`,
        `${kind}_status.neq.processing`,
        `${kind}_requested_at.is.null`,
        `${kind}_requested_at.lt."${staleBefore}"`,
      ].join(",")
    )
    .select("id");
  if (error) throw error;
  return data.length > 0;
}

/** Puts a job's status back as it was before `claimEnhancement` (the debit was refused). */
export async function releaseEnhancement(
  admin: ServiceClient,
  {
    generationId,
    kind,
    previous,
  }: { generationId: string; kind: EnhancementKind; previous: EnhancementState }
) {
  await admin
    .from("generations")
    .update(enhancementPatch(kind, previous.status, previous.requestedAt))
    .eq("id", generationId);
}

/** Refunds a job's credits, then flags it failed — in that order, so the editor reads the refunded balance when the status change reaches it. */
export async function failEnhancement(
  admin: ServiceClient,
  {
    generationId,
    userId,
    kind,
    creditsCost,
    description,
  }: { generationId: string; userId: string; kind: EnhancementKind; creditsCost: number; description: string }
) {
  await refundCredits(admin, { userId, amount: creditsCost, generationId, description });
  await admin.from("generations").update(enhancementPatch(kind, "failed")).eq("id", generationId);
}

// ============================================================
// Paid exports / panel splits — a definitive failure flips the row to
// "failed" and refunds, conditionally, so a retried hook can't refund twice.
// ============================================================

export async function failExport(
  admin: ServiceClient,
  { exportId, creditsCost, message }: { exportId: string; creditsCost: number; message: string }
) {
  const { data } = await admin
    .from("generation_exports")
    .update({ status: "failed", error_message: message })
    .eq("id", exportId)
    .neq("status", "failed")
    .select("user_id, generation_id");
  const row = data?.[0];
  if (!row || creditsCost <= 0) return;
  await refundCredits(admin, {
    userId: row.user_id,
    amount: creditsCost,
    generationId: row.generation_id,
    description: "Refund for failed export",
  });
}

export async function failPanelExtraction(
  admin: ServiceClient,
  { extractionId, creditsCost, message }: { extractionId: string; creditsCost: number; message: string }
) {
  const { data } = await admin
    .from("panel_extractions")
    .update({ status: "failed", error_message: message })
    .eq("id", extractionId)
    .neq("status", "failed")
    .select("user_id");
  const row = data?.[0];
  if (!row || creditsCost <= 0) return;
  await refundCredits(admin, { userId: row.user_id, amount: creditsCost, description: "Refund for failed panel split" });
}

// ============================================================
// Render persistence — provider CDN URLs expire after a few days, so the
// finished files are copied into our private bucket before the
// generation is marked completed.
// ============================================================

export function renderedVideoPath(generation: Pick<GenerationRow, "id" | "user_id" | "project_id">) {
  return `${generation.user_id}/${generation.project_id}/${generation.id}.mp4`;
}

async function mirrorRemoteFile(remoteUrl: string, path: string, fallbackContentType: string) {
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Could not download ${remoteUrl}: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") ?? fallbackContentType;
  const buffer = Buffer.from(await response.arrayBuffer());
  // upsert + deterministic path: a retried webhook/cron pass rewrites the
  // same object instead of leaving orphaned copies behind.
  return uploadBufferToStorage(RENDERED_VIDEOS_BUCKET, path, buffer, contentType);
}

// ============================================================
// Finalizers — the provider webhook (primary), the reconciliation cron
// (fallback) and the editor's manual refresh can all race to finalize the
// same generation. The status update is conditional on the row still
// being non-terminal, so exactly one caller wins the transition; only the
// winner triggers post-processing or issues a refund.
// ============================================================

export async function finalizeGenerationCompleted(
  generationId: string,
  { videoUrl, thumbnailUrl }: { videoUrl?: string; thumbnailUrl?: string },
  admin: ServiceClient = createServiceRoleClient()
): Promise<{ generation: GenerationRow | null; transitioned: boolean }> {
  const { data: generation } = await admin
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .single();

  if (!generation || !NON_TERMINAL_STATUSES.includes(generation.status)) {
    return { generation, transitioned: false };
  }

  if (!videoUrl) {
    const failed = await finalizeGenerationFailed(generationId, "Provider reported success but returned no video", admin);
    return { generation: failed, transitioned: false };
  }

  // Throws on download/upload failure: the row stays "processing", so the
  // provider's webhook retry or the reconciliation cron tries again.
  const videoPath = await mirrorRemoteFile(videoUrl, renderedVideoPath(generation), "video/mp4");

  let thumbnailPath: string | null = generation.thumbnail_url;
  if (thumbnailUrl) {
    try {
      thumbnailPath = await mirrorRemoteFile(
        thumbnailUrl,
        `${generation.user_id}/${generation.project_id}/${generation.id}-thumb`,
        "image/jpeg"
      );
    } catch {
      // A missing poster frame shouldn't block delivering the video.
      thumbnailPath = generation.thumbnail_url;
    }
  }

  const { data: updated } = await admin
    .from("generations")
    .update({
      status: "completed",
      progress: 70,
      output_video_url: videoPath,
      thumbnail_url: thumbnailPath,
      completed_at: new Date().toISOString(),
    })
    .eq("id", generationId)
    .in("status", NON_TERMINAL_STATUSES)
    .select("*")
    .maybeSingle();

  if (!updated) {
    const { data: current } = await admin.from("generations").select("*").eq("id", generationId).single();
    return { generation: current, transitioned: false };
  }

  await admin.from("projects").update({ status: "ready" }).eq("id", generation.project_id);
  return { generation: updated, transitioned: true };
}

export async function finalizeGenerationFailed(
  generationId: string,
  errorMessage: string,
  admin: ServiceClient = createServiceRoleClient()
): Promise<GenerationRow | null> {
  const { data: updated } = await admin
    .from("generations")
    .update({ status: "failed", progress: 0, error_message: errorMessage })
    .eq("id", generationId)
    .in("status", NON_TERMINAL_STATUSES)
    .select("*")
    .maybeSingle();

  if (!updated) {
    const { data: current } = await admin.from("generations").select("*").eq("id", generationId).single();
    return current;
  }

  await refundCredits(admin, {
    userId: updated.user_id,
    amount: updated.credits_cost,
    generationId,
    description: "Refund for failed generation",
  });

  return updated;
}

/**
 * An optional pre-processing step (colorize / text removal) failed and the
 * render goes ahead without it: refund what that option added to the price,
 * and lower credits_cost so a later failure refund doesn't count it twice.
 * `generation`'s colorize/remove_text flags mean "still charged for"; merge
 * the returned patch back so a second failed option is priced correctly.
 */
export async function refundOptionSurcharge(
  admin: ServiceClient,
  generation: Pick<GenerationRow, "id" | "user_id" | "credits_cost" | "duration_seconds" | "resolution" | "colorize" | "remove_text">,
  option: "colorize" | "removeText"
): Promise<Pick<GenerationRow, "credits_cost" | "colorize" | "remove_text">> {
  const charged = {
    colorize: option === "colorize" ? false : generation.colorize,
    remove_text: option === "removeText" ? false : generation.remove_text,
  };
  const without = calculateCreditsCost({
    durationSeconds: generation.duration_seconds,
    resolution: generation.resolution,
    colorize: charged.colorize,
    removeText: charged.remove_text,
  });
  const surcharge = generation.credits_cost - without;
  if (surcharge <= 0) return { ...charged, credits_cost: generation.credits_cost };

  await admin.from("generations").update({ credits_cost: without }).eq("id", generation.id);
  await refundCredits(admin, {
    userId: generation.user_id,
    amount: surcharge,
    generationId: generation.id,
    description: option === "colorize" ? "Refund — colorization failed" : "Refund — text removal failed",
  });
  return { ...charged, credits_cost: without };
}

export async function setGenerationProgress(
  generationId: string,
  progress: number,
  extra: Record<string, unknown> = {},
  admin: ServiceClient = createServiceRoleClient()
) {
  await admin
    .from("generations")
    .update({ progress, ...extra })
    .eq("id", generationId);
}
