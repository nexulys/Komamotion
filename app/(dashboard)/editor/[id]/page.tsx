import { notFound } from "next/navigation";
import {
  requireCurrentUser,
  getProjectById,
  getGenerationsForProject,
  getProjectEpisodes,
  getProjectPanels,
} from "@/lib/supabase/queries";
import { EditorWorkspace } from "@/components/editor-workspace";
import { isAudioConfigured } from "@/lib/ai/audio";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { authUserId, profile } = await requireCurrentUser();

  let project;
  try {
    project = await getProjectById(id, authUserId);
  } catch {
    notFound();
  }
  if (!project) notFound();

  const [generations, panels, episodes] = await Promise.all([
    getGenerationsForProject(id, authUserId),
    getProjectPanels(id, authUserId),
    getProjectEpisodes(id, authUserId),
  ]);

  return (
    <EditorWorkspace
      project={project}
      initialGenerations={generations}
      initialPanels={panels}
      initialEpisodes={episodes}
      credits={profile?.credits_balance ?? 0}
      userId={authUserId}
      plan={profile?.plan ?? "free"}
      isAdmin={profile?.is_admin ?? false}
      audioAvailable={isAudioConfigured()}
    />
  );
}
