"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/supabase/queries";
import { createVideoGeneration, getDefaultProvider, getVideoGenerationStatus } from "@/lib/ai";
import { calculateCreditsCost } from "@/lib/stripe/credits";
import type { AnimationSettingsValue } from "@/components/animation-settings";
import type { GenerationRow } from "@/lib/supabase/types";

async function getWebhookUrl() {
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL || h.get("origin") || `https://${h.get("host")}`;
  const secret = process.env.AI_WEBHOOK_SECRET ?? "";
  return `${origin}/api/webhooks/ai?token=${encodeURIComponent(secret)}`;
}

export async function startGeneration({
  projectId,
  sourceImageUrl,
  settings,
}: {
  projectId: string;
  sourceImageUrl: string;
  settings: AnimationSettingsValue;
}): Promise<{ generation?: GenerationRow; error?: string }> {
  const { authUserId, profile } = await requireCurrentUser();
  const creditsCost = calculateCreditsCost({
    durationSeconds: settings.durationSeconds,
    resolution: settings.resolution,
    colorize: settings.colorize,
  });

  const balance = profile?.credits_balance ?? 0;
  if (balance < creditsCost) {
    return { error: `Not enough credits. This render needs ${creditsCost}, you have ${balance}.` };
  }

  const admin = createServiceRoleClient();

  const { data: generation, error: insertError } = await admin
    .from("generations")
    .insert({
      project_id: projectId,
      user_id: authUserId,
      source_image_url: sourceImageUrl,
      status: "pending",
      provider: getDefaultProvider(),
      prompt: settings.prompt || null,
      camera_movement: settings.cameraMovement,
      motion_intensity: settings.motionIntensity,
      fps: settings.fps,
      resolution: settings.resolution,
      colorize: settings.colorize,
      duration_seconds: settings.durationSeconds,
      credits_cost: creditsCost,
    })
    .select("*")
    .single();

  if (insertError || !generation) {
    return { error: insertError?.message ?? "Could not create generation." };
  }

  await admin.from("credit_transactions").insert({
    user_id: authUserId,
    amount: -creditsCost,
    type: "generation_debit",
    description: `Render for project ${projectId}`,
    generation_id: generation.id,
  });
  await admin
    .from("users")
    .update({ credits_balance: balance - creditsCost })
    .eq("id", authUserId);

  await admin.from("projects").update({ status: "processing" }).eq("id", projectId);

  try {
    const webhookUrl = await getWebhookUrl();
    const job = await createVideoGeneration({
      imageUrl: sourceImageUrl,
      prompt: settings.prompt,
      cameraMovement: settings.cameraMovement,
      motionIntensity: settings.motionIntensity,
      fps: settings.fps,
      resolution: settings.resolution,
      durationSeconds: settings.durationSeconds,
      colorize: settings.colorize,
      webhookUrl,
    });

    const { data: updated } = await admin
      .from("generations")
      .update({ external_job_id: job.externalJobId, provider: job.provider, status: "processing" })
      .eq("id", generation.id)
      .select("*")
      .single();

    revalidatePath(`/editor/${projectId}`);
    return { generation: updated ?? generation };
  } catch (err) {
    await refundFailedGeneration(admin, generation.id, authUserId, creditsCost, err);
    revalidatePath(`/editor/${projectId}`);
    return { error: "Failed to start the AI render. Your credits have been refunded." };
  }
}

async function refundFailedGeneration(
  admin: ReturnType<typeof createServiceRoleClient>,
  generationId: string,
  userId: string,
  creditsCost: number,
  err: unknown
) {
  const message = err instanceof Error ? err.message : "Unknown error submitting AI job";

  await admin
    .from("generations")
    .update({ status: "failed", error_message: message })
    .eq("id", generationId);

  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount: creditsCost,
    type: "refund",
    description: "Refund for failed generation",
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
      .update({ credits_balance: user.credits_balance + creditsCost })
      .eq("id", userId);
  }
}

export async function refreshGenerationStatus(
  generationId: string
): Promise<{ generation?: GenerationRow; error?: string }> {
  const { authUserId } = await requireCurrentUser();
  const supabase = await createClient();

  const { data: generation, error } = await supabase
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .eq("user_id", authUserId)
    .single();

  if (error || !generation) {
    return { error: "Generation not found." };
  }

  if (generation.status === "completed" || generation.status === "failed") {
    return { generation };
  }

  if (!generation.external_job_id) {
    return { generation };
  }

  const status = await getVideoGenerationStatus(generation.provider, generation.external_job_id);
  const admin = createServiceRoleClient();

  if (status.status === "completed") {
    const { data: updated } = await admin
      .from("generations")
      .update({
        status: "completed",
        output_video_url: status.videoUrl,
        thumbnail_url: status.thumbnailUrl ?? generation.thumbnail_url,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generationId)
      .select("*")
      .single();

    await admin
      .from("projects")
      .update({
        status: "ready",
        cover_image_url: status.thumbnailUrl ?? undefined,
      })
      .eq("id", generation.project_id);

    revalidatePath(`/editor/${generation.project_id}`);
    return { generation: updated ?? generation };
  }

  if (status.status === "failed") {
    await refundFailedGeneration(
      admin,
      generationId,
      authUserId,
      generation.credits_cost,
      new Error(status.error ?? "Generation failed")
    );
    const { data: updated } = await admin
      .from("generations")
      .select("*")
      .eq("id", generationId)
      .single();
    revalidatePath(`/editor/${generation.project_id}`);
    return { generation: updated ?? generation };
  }

  if (status.status !== generation.status) {
    const { data: updated } = await admin
      .from("generations")
      .update({ status: status.status })
      .eq("id", generationId)
      .select("*")
      .single();
    return { generation: updated ?? generation };
  }

  return { generation };
}
