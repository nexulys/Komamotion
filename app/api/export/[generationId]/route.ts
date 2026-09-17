import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RENDERED_VIDEOS_BUCKET, resolveMediaUrl } from "@/lib/supabase/signed-url";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

/**
 * Streams a completed render back to the browser with a clean
 * Content-Disposition filename. output_video_url may be the AI
 * provider's own CDN URL, or a path in our private rendered-videos
 * bucket (once watermarked/upscaled/muxed) — resolveMediaUrl handles both.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ generationId: string }> }
) {
  const { generationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await enforceRateLimit("export", user.id);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    throw err;
  }

  const { data: generation, error } = await supabase
    .from("generations")
    .select("output_video_url, status, project_id")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .single();

  if (error || !generation || generation.status !== "completed" || !generation.output_video_url) {
    return NextResponse.json({ error: "Export not available" }, { status: 404 });
  }

  const downloadUrl = await resolveMediaUrl(RENDERED_VIDEOS_BUCKET, generation.output_video_url);
  if (!downloadUrl) {
    return NextResponse.json({ error: "Could not resolve video URL" }, { status: 502 });
  }

  const upstream = await fetch(downloadUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Could not fetch rendered video" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
      "Content-Disposition": `attachment; filename="komamotion-${generationId}.mp4"`,
      ...(upstream.headers.get("content-length")
        ? { "Content-Length": upstream.headers.get("content-length")! }
        : {}),
    },
  });
}
