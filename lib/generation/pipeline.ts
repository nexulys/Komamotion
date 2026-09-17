import { createServiceRoleClient } from "@/lib/supabase/server";
import { RENDERED_VIDEOS_BUCKET } from "@/lib/supabase/signed-url";
import type { AiProvider, GenerationRow } from "@/lib/supabase/types";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Idempotent finalizers shared by every path that can learn a generation
 * is done: the provider webhook (primary), the reconciliation cron
 * (fallback for missed webhooks), and a Trigger.dev task that fails fast
 * at submission time. All three can race — each checks the row is still
 * non-terminal before writing, so only the first one to arrive wins.
 */

export async function finalizeGenerationCompleted(
  generationId: string,
  { videoUrl, thumbnailUrl }: { videoUrl?: string; thumbnailUrl?: string },
  admin: ServiceClient = createServiceRoleClient()
): Promise<GenerationRow | null> {
  const { data: generation } = await admin
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .single();

  if (!generation || generation.status === "completed" || generation.status === "failed") {
    return generation;
  }

  const { data: updated } = await admin
    .from("generations")
    .update({
      status: "completed",
      progress: 70,
      output_video_url: videoUrl ?? generation.output_video_url,
      thumbnail_url: thumbnailUrl ?? generation.thumbnail_url,
      completed_at: new Date().toISOString(),
    })
    .eq("id", generationId)
    .select("*")
    .single();

  await admin.from("projects").update({ status: "ready" }).eq("id", generation.project_id);

  return updated ?? generation;
}

export async function finalizeGenerationFailed(
  generationId: string,
  errorMessage: string,
  admin: ServiceClient = createServiceRoleClient()
): Promise<GenerationRow | null> {
  const { data: generation } = await admin
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .single();

  if (!generation || generation.status === "completed" || generation.status === "failed") {
    return generation;
  }

  const { data: updated } = await admin
    .from("generations")
    .update({ status: "failed", progress: 0, error_message: errorMessage })
    .eq("id", generationId)
    .select("*")
    .single();

  await refundCredits(admin, {
    userId: generation.user_id,
    amount: generation.credits_cost,
    generationId,
    description: "Refund for failed generation",
  });

  return updated ?? generation;
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
  if (amount <= 0) return;

  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount,
    type: "refund",
    description,
    generation_id: generationId,
  });

  const { data: user } = await admin
    .from("users")
    .select("credits_balance")
    .eq("id", userId)
    .single();

  if (user) {
    await admin
      .from("users")
      .update({ credits_balance: user.credits_balance + amount })
      .eq("id", userId);
  }
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

export async function findExternalJobId(
  admin: ServiceClient,
  provider: AiProvider,
  externalJobId: string
) {
  const { data } = await admin
    .from("generations")
    .select("*")
    .eq("provider", provider)
    .eq("external_job_id", externalJobId)
    .single();
  return data;
}

export { RENDERED_VIDEOS_BUCKET };
