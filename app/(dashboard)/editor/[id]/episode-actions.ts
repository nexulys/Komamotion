"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireCurrentUser, resolveEpisodeMedia } from "@/lib/supabase/queries";
import { RENDERED_VIDEOS_BUCKET, deleteFromStorage } from "@/lib/supabase/signed-url";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { validateEpisodeRequest, type EpisodeRequest } from "@/lib/generation/episodes";
import { isGenerationFinalized } from "@/lib/generation/status";
import { assembleEpisodeTask } from "@/trigger/assemble-episode";
import type { EpisodeRow } from "@/lib/supabase/types";

type ActionResult<T> = { data?: T; error?: string };

/**
 * Queues an episode built from finished renders of one project. Every clip
 * must be the user's own, from this project, and finalized (so free renders
 * are already watermarked). No credits: the renders were paid for.
 */
export async function createEpisode(projectId: string, request: EpisodeRequest): Promise<ActionResult<EpisodeRow>> {
  const { authUserId } = await requireCurrentUser();
  const valid = validateEpisodeRequest(request);
  if ("error" in valid) return { error: valid.error };

  try {
    await enforceRateLimit("export", authUserId);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const admin = createServiceRoleClient();
  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("user_id", authUserId).maybeSingle();
  if (!project) return { error: "Project not found." };

  const ids = [...new Set(valid.data.clips.map((c) => c.generation_id))];
  const { data: generations } = await admin
    .from("generations")
    .select("id, status, progress")
    .in("id", ids)
    .eq("project_id", projectId)
    .eq("user_id", authUserId);
  const ready = new Set((generations ?? []).filter(isGenerationFinalized).map((g) => g.id));
  if (!ids.every((id) => ready.has(id))) {
    return { error: "Some of these renders aren't finished yet (or were removed). Pick finished renders only." };
  }

  const { data: episode, error } = await admin
    .from("episodes")
    .insert({ project_id: projectId, user_id: authUserId, status: "pending", ...valid.data })
    .select("*")
    .single();
  if (error || !episode) return { error: error?.message ?? "Could not create the episode." };

  try {
    await assembleEpisodeTask.trigger({ episodeId: episode.id });
  } catch (err) {
    console.error("[episodes] could not queue assembly", episode.id, err);
    await admin.from("episodes").update({ status: "failed", error_message: "Could not be queued" }).eq("id", episode.id);
    return { error: "Could not start building the episode. Please try again." };
  }

  return { data: episode };
}

export async function getEpisode(episodeId: string): Promise<EpisodeRow | null> {
  const { authUserId } = await requireCurrentUser();
  const { data } = await createServiceRoleClient()
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .eq("user_id", authUserId)
    .maybeSingle();
  return data ? resolveEpisodeMedia(data) : null;
}

export async function deleteEpisode(episodeId: string): Promise<ActionResult<{ deleted: true }>> {
  const { authUserId } = await requireCurrentUser();
  const admin = createServiceRoleClient();
  const { data: episode } = await admin
    .from("episodes")
    .delete()
    .eq("id", episodeId)
    .eq("user_id", authUserId)
    .select("output_video_url, thumbnail_url")
    .maybeSingle();
  if (!episode) return { error: "Episode not found." };
  await deleteFromStorage(
    RENDERED_VIDEOS_BUCKET,
    [episode.output_video_url, episode.thumbnail_url].filter((p): p is string => Boolean(p))
  );
  return { data: { deleted: true } };
}
