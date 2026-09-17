"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/supabase/queries";
import { MANGA_SOURCES_BUCKET, RENDERED_VIDEOS_BUCKET, deleteFromStorage } from "@/lib/supabase/signed-url";

export async function createProject(formData: FormData) {
  const { authUserId } = await requireCurrentUser();
  const title = String(formData.get("title") ?? "").trim() || "Untitled project";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: authUserId, title })
    .select("id")
    .single();

  if (error) throw error;

  redirect(`/editor/${data.id}`);
}

export async function deleteProject(projectId: string) {
  const { authUserId } = await requireCurrentUser();
  const admin = createServiceRoleClient();

  // Best-effort immediate cleanup of this project's storage objects —
  // the DB rows cascade-delete, but Supabase Storage doesn't. The nightly
  // cleanup-storage cron (trigger/cleanup-storage.ts) sweeps up anything
  // missed here (e.g. a request that gets interrupted).
  const { data: generations } = await admin
    .from("generations")
    .select("source_image_url, output_video_url, upscaled_video_url, audio_url")
    .eq("project_id", projectId)
    .eq("user_id", authUserId);

  const sourcePaths = (generations ?? [])
    .map((g) => g.source_image_url)
    .filter((p): p is string => p != null && !p.startsWith("http"));
  const renderedPaths = (generations ?? [])
    .flatMap((g) => [g.output_video_url, g.upscaled_video_url, g.audio_url])
    .filter((p): p is string => p != null && !p.startsWith("http"));

  const { error } = await admin
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", authUserId);

  if (error) throw error;

  await Promise.all([
    deleteFromStorage(MANGA_SOURCES_BUCKET, sourcePaths),
    deleteFromStorage(RENDERED_VIDEOS_BUCKET, renderedPaths),
  ]);

  revalidatePath("/projects");
}
