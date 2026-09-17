import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getVideoGenerationStatus } from "@/lib/ai";
import { finalizeGenerationCompleted, finalizeGenerationFailed, setGenerationProgress } from "@/lib/generation/pipeline";
import { verifyReplicateWebhook } from "@/lib/webhooks/replicate";
import { verifyFalWebhook } from "@/lib/webhooks/fal";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { postProcessGenerationTask } from "@/trigger/post-process-generation";
import type { AiProvider } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Shared callback endpoint for both fal.ai and Replicate. Requires BOTH
 * the shared-secret token in the URL (set when the job was submitted —
 * see lib/env.ts getAiWebhookUrl) AND a valid provider signature over the
 * raw body before touching the DB. We still don't trust the payload's
 * claimed status — we re-fetch it from the provider so a forged body
 * can't fake completion even if it somehow got past signature checks.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await enforceRateLimit("webhook", ip);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    throw err;
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const expected = process.env.AI_WEBHOOK_SECRET ?? "";
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Invalid webhook token" }, { status: 401 });
  }

  const rawBody = await request.text();

  const isReplicateDelivery = request.headers.has("webhook-signature");
  const isFalDelivery = request.headers.has("x-fal-webhook-signature");

  if (isReplicateDelivery) {
    if (!verifyReplicateWebhook(rawBody, request.headers)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  } else if (isFalDelivery) {
    if (!(await verifyFalWebhook(rawBody, request.headers))) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  } else {
    // Neither provider's signature headers are present — refuse rather
    // than fall back to trusting the shared secret alone.
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody || "{}");
  const externalJobId: string | undefined = payload.request_id ?? payload.id ?? payload.job_id;

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

  const status = await getVideoGenerationStatus(generation.provider as AiProvider, externalJobId);

  if (status.status === "completed") {
    await finalizeGenerationCompleted(
      generation.id,
      { videoUrl: status.videoUrl, thumbnailUrl: status.thumbnailUrl },
      admin
    );
    await postProcessGenerationTask.trigger({ generationId: generation.id });
  } else if (status.status === "failed") {
    await finalizeGenerationFailed(generation.id, status.error ?? "Generation failed", admin);
  } else {
    await setGenerationProgress(generation.id, generation.progress || 50, { status: status.status }, admin);
  }

  return NextResponse.json({ received: true });
}
