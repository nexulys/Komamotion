import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Streams a completed render back to the browser with a clean
 * Content-Disposition filename, since output_video_url points at the
 * AI provider's own CDN and won't carry a KomaMotion-branded filename.
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

  const { data: generation, error } = await supabase
    .from("generations")
    .select("output_video_url, status, project_id")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .single();

  if (error || !generation || generation.status !== "completed" || !generation.output_video_url) {
    return NextResponse.json({ error: "Export not available" }, { status: 404 });
  }

  const upstream = await fetch(generation.output_video_url);
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
