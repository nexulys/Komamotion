import { createClient } from "@/lib/supabase/server";
import {
  MANGA_SOURCES_BUCKET,
  RENDERED_VIDEOS_BUCKET,
  resolveMediaUrl,
} from "@/lib/supabase/signed-url";
import type { GenerationRow, UserRow } from "@/lib/supabase/types";

/**
 * `source_image_url` / `output_video_url` / `thumbnail_url` may hold either
 * a path inside our private buckets or an external provider CDN URL (see
 * lib/supabase/signed-url.ts). Reads always resolve to a usable, briefly
 * expiring URL before the row reaches a client component.
 */
async function resolveGenerationMedia(generation: GenerationRow): Promise<GenerationRow> {
  const [sourceImageUrl, outputVideoUrl, thumbnailUrl, upscaledVideoUrl, audioUrl] =
    await Promise.all([
      resolveMediaUrl(MANGA_SOURCES_BUCKET, generation.source_image_url),
      resolveMediaUrl(RENDERED_VIDEOS_BUCKET, generation.output_video_url),
      resolveMediaUrl(RENDERED_VIDEOS_BUCKET, generation.thumbnail_url),
      resolveMediaUrl(RENDERED_VIDEOS_BUCKET, generation.upscaled_video_url),
      resolveMediaUrl(RENDERED_VIDEOS_BUCKET, generation.audio_url),
    ]);

  return {
    ...generation,
    source_image_url: sourceImageUrl ?? generation.source_image_url,
    output_video_url: outputVideoUrl,
    thumbnail_url: thumbnailUrl,
    upscaled_video_url: upscaledVideoUrl,
    audio_url: audioUrl,
  };
}

async function resolveThumbnail<T extends { thumbnail_url: string | null }>(
  row: T
): Promise<T> {
  return { ...row, thumbnail_url: await resolveMediaUrl(RENDERED_VIDEOS_BUCKET, row.thumbnail_url) };
}

export async function getCurrentUser(): Promise<{
  authUserId: string;
  email: string | null;
  profile: UserRow | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  return { authUserId: user.id, email: user.email ?? null, profile: profile ?? null };
}

export async function requireCurrentUser() {
  const current = await getCurrentUser();
  if (!current) {
    throw new Error("Not authenticated");
  }
  return current;
}

export async function getProjectsForUser(userId: string) {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!projects.length) return [];

  const { data: generations } = await supabase
    .from("generations")
    .select("id, project_id, status, output_video_url, thumbnail_url, created_at")
    .in(
      "project_id",
      projects.map((p) => p.id)
    )
    .order("created_at", { ascending: false });

  const resolvedGenerations = await Promise.all((generations ?? []).map(resolveThumbnail));

  return projects.map((project) => ({
    ...project,
    generations: resolvedGenerations.filter((g) => g.project_id === project.id),
  }));
}

export async function getProjectById(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function getCreditTransactions(userId: string, limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getGenerationById(generationId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return resolveGenerationMedia(data);
}

export async function getGenerationsForProject(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Promise.all(data.map(resolveGenerationMedia));
}
