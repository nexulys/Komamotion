import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProjectRow } from "@/lib/supabase/types";

export function EditorHeader({ project, credits }: { project: ProjectRow; credits: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{project.title}</h1>
        <Badge variant="secondary" className="mt-1 capitalize">
          {project.status}
        </Badge>
      </div>
      <Badge variant="outline" className="gap-1.5">
        <Coins className="size-3.5 text-primary" />
        {credits.toLocaleString()} credits
      </Badge>
    </div>
  );
}
