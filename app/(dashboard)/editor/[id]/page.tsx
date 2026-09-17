import { notFound } from "next/navigation";
import { requireCurrentUser, getProjectById, getGenerationsForProject } from "@/lib/supabase/queries";
import { EditorWorkspace } from "@/components/editor-workspace";

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

  const generations = await getGenerationsForProject(id, authUserId);

  return (
    <EditorWorkspace
      project={project}
      initialGenerations={generations}
      credits={profile?.credits_balance ?? 0}
    />
  );
}
