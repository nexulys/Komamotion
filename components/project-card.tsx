"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Film, MoreVertical, Trash2 } from "lucide-react";
import { deleteProject } from "@/app/(dashboard)/projects/actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/lib/supabase/types";

const STATUS_VARIANT: Record<ProjectStatus, "secondary" | "warning" | "success" | "outline"> = {
  draft: "secondary",
  processing: "warning",
  ready: "success",
  archived: "outline",
};

export function ProjectCard({
  project,
}: {
  project: {
    id: string;
    title: string;
    status: ProjectStatus;
    updated_at: string;
    generations: { thumbnail_url: string | null; output_video_url: string | null }[];
  };
}) {
  const [isPending, startTransition] = useTransition();
  const thumbnail = project.generations.find((g) => g.thumbnail_url)?.thumbnail_url;

  return (
    <Card className="group overflow-hidden pt-0">
      <Link href={`/editor/${project.id}`}>
        <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-secondary/40">
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt={project.title}
              className="size-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <Film className="size-8 text-muted-foreground/50" />
          )}
        </div>
      </Link>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="line-clamp-1 text-base">
            <Link href={`/editor/${project.id}`}>{project.title}</Link>
          </CardTitle>
          <Badge variant={STATUS_VARIANT[project.status]} className="capitalize">
            {project.status}
          </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 shrink-0">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              disabled={isPending}
              onSelect={() =>
                startTransition(() => {
                  deleteProject(project.id);
                })
              }
            >
              <Trash2 className="size-4" />
              Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          {project.generations.length} generation
          {project.generations.length === 1 ? "" : "s"}
        </p>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          Updated {new Date(project.updated_at).toLocaleDateString()}
        </p>
      </CardFooter>
    </Card>
  );
}
