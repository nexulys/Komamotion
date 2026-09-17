import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getVideoGenerationStatus } from "@/lib/ai";
import type { AiProvider } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Shared callback endpoint for both fal.ai and Replicate. Providers are
 * configured (see lib/ai/*.ts submit()) to POST here with the job id in
 * the payload; we don't trust the payload's status, we re-fetch it from
 * the provider so a malformed/forged webhook body can't fake completion.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const expected = process.env.AI_WEBHOOK_SECRET ?? "";

  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Invalid webhook token" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const externalJobId: string | undefined =
    payload.request_id ?? payload.id ?? payload.job_id;

  if (!externalJobId) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: generation } = await admin
    .from("generations")
    .select("*")
    .eq("external_job_id", externalJobId)
    .single();

  if (!generation) {
    return NextResponse.json({ error: "Unknown generation" }, { status: 404 });
  }

  if (generation.status === "completed" || generation.status === "failed") {
    return NextResponse.json({ received: true, alreadyResolved: true });
  }

  const status = await getVideoGenerationStatus(
    generation.provider as AiProvider,
    externalJobId
  );

  if (status.status === "completed") {
    await admin
      .from("generations")
      .update({
        status: "completed",
        output_video_url: status.videoUrl,
        thumbnail_url: status.thumbnailUrl ?? generation.thumbnail_url,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generation.id);

    await admin
      .from("projects")
      .update({ status: "ready" })
      .eq("id", generation.project_id);
  } else if (status.status === "failed") {
    await admin
      .from("generations")
      .update({ status: "failed", error_message: status.error ?? "Generation failed" })
      .eq("id", generation.id);

    const { data: user } = await admin
      .from("users")
      .select("credits_balance")
      .eq("id", generation.user_id)
      .single();

    if (user) {
      await admin.from("credit_transactions").insert({
        user_id: generation.user_id,
        amount: generation.credits_cost,
        type: "refund",
        description: "Refund for failed generation",
        generation_id: generation.id,
      });
      await admin
        .from("users")
        .update({ credits_balance: user.credits_balance + generation.credits_cost })
        .eq("id", generation.user_id);
    }
  } else {
    await admin
      .from("generations")
      .update({ status: status.status })
      .eq("id", generation.id);
  }

  return NextResponse.json({ received: true });
}
