import { CheckCircle2, FolderKanban } from "lucide-react";
import { requireCurrentUser, getProjectsForUser } from "@/lib/supabase/queries";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectCard } from "@/components/project-card";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const { password } = await searchParams;
  const { authUserId } = await requireCurrentUser();
  const projects = await getProjectsForUser(authUserId);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      {password === "updated" && (
        <p className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="size-4" />
          Your password has been updated.
        </p>
      )}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Your manga panels, animated and ready to export.
          </p>
        </div>
        <NewProjectDialog />
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-24 text-center">
          <FolderKanban className="mb-4 size-10 text-muted-foreground/50" />
          <h2 className="text-lg font-medium">No projects yet</h2>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            Create your first project, upload manga panels, and generate your
            first AI animation in minutes.
          </p>
          <NewProjectDialog />
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
