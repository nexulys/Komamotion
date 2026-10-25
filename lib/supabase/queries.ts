import type { User } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  MANGA_SOURCES_BUCKET,
  RENDERED_VIDEOS_BUCKET,
  createSignedUrls,
  resolveMediaUrl,
} from "@/lib/supabase/signed-url";
import type { MangaPanel } from "@/components/manga-uploader";
import { isGenerationFinalized } from "@/lib/generation/status";
import type { EpisodeRow, GenerationRow, UserRow } from "@/lib/supabase/types";

/**
 * `source_image_url` / `output_video_url` / `thumbnail_url` may hold either
 * a path inside our private buckets or an external provider CDN URL (see
 * lib/supabase/signed-url.ts). Reads always resolve to a usable, briefly
 * expiring URL before the row reaches a client component.
 */
async function resolveGenerationMedia(generation: GenerationRow): Promise<GenerationRow> {
  if (generation.status === "completed" && !isGenerationFinalized(generation)) {
    // Finalizing (watermark / post-process): present it as still rendering and
    // keep the not-yet-final video out of the browser.
    return resolveGenerationMedia({
      ...generation,
      status: "processing",
      progress: Math.min(generation.progress, 95),
      output_video_url: null,
    });
  }

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

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profile = existing ?? (await ensureUserProfile(user));

  return { authUserId: user.id, email: user.email ?? null, profile };
}

/**
 * The `on_auth_user_created` trigger normally creates the public.users row
 * at signup, but accounts created before the trigger existed have none —
 * and every project/generation row has a foreign key to it. Recreate it on
 * first sight instead of letting the first insert crash.
 */
async function ensureUserProfile(user: User): Promise<UserRow | null> {
  const admin = createServiceRoleClient();
  const metadata = user.user_metadata ?? {};

  await admin.from("users").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      display_name: (metadata.full_name ?? metadata.name ?? null) as string | null,
      avatar_url: (metadata.avatar_url ?? null) as string | null,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  const { data } = await admin.from("users").select("*").eq("id", user.id).maybeSingle();
  return data;
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

const PANEL_FILE = /\.(png|jpe?g|webp)$/i;
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

/**
 * Every image in the project's storage folder — uploads and panels split
 * out of a page — newest first, so the editor's panel strip survives a
 * reload. Each panel carries its storage path (what actions need) and a
 * short-lived signed URL (what the browser displays).
 */
export async function getProjectPanels(projectId: string, userId: string): Promise<MangaPanel[]> {
  const admin = createServiceRoleClient();
  const folder = `${userId}/${projectId}`;
  const { data: files } = await admin.storage
    .from(MANGA_SOURCES_BUCKET)
    .list(folder, { limit: 200, sortBy: { column: "created_at", order: "desc" } });

  const paths = (files ?? []).filter((f) => f.id && PANEL_FILE.test(f.name)).map((f) => `${folder}/${f.name}`);
  if (paths.length === 0) return [];

  const signed = await createSignedUrls(MANGA_SOURCES_BUCKET, paths);
  return signed
    .filter((s): s is typeof s & { path: string; signedUrl: string } => Boolean(s.path && s.signedUrl))
    .map((s) => ({
      id: s.path,
      path: s.path,
      url: s.signedUrl,
      name: s.path.split("/").pop()!.replace(UUID_PREFIX, ""),
    }));
}

/** Signed URLs for an episode's video and poster (the columns hold storage paths). */
export async function resolveEpisodeMedia(episode: EpisodeRow): Promise<EpisodeRow> {
  const [video, thumbnail] = await Promise.all([
    resolveMediaUrl(RENDERED_VIDEOS_BUCKET, episode.output_video_url),
    resolveMediaUrl(RENDERED_VIDEOS_BUCKET, episode.thumbnail_url),
  ]);
  return { ...episode, output_video_url: video, thumbnail_url: thumbnail };
}

export async function getProjectEpisodes(projectId: string, userId: string): Promise<EpisodeRow[]> {
  const { data } = await createServiceRoleClient()
    .from("episodes")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return Promise.all((data ?? []).map(resolveEpisodeMedia));
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
