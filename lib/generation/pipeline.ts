import { createServiceRoleClient } from "@/lib/supabase/server";
import { RENDERED_VIDEOS_BUCKET, uploadBufferToStorage } from "@/lib/supabase/signed-url";
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
