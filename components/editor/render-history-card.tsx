import { Film, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_LABEL } from "@/components/editor/editor-constants";
import { resolveVideoModel } from "@/lib/ai/video-models";
import { cn } from "@/lib/utils";
import type { GenerationRow } from "@/lib/supabase/types";

/**
 * Every render of the project. Finished ones open in the preview above —
 * to play, download or export — not only the latest.
 */
export function RenderHistoryCard({
  generations,
  viewedId,
  onView,
  showModel = false,
}: {
  generations: GenerationRow[];
  /** The render currently in the preview. */
  viewedId: string | null;
  onView: (generationId: string) => void;
  /** Admins see which model rendered each clip. */
  showModel?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Render history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {generations.map((g) => {
          const playable = g.status === "completed";
          const viewed = g.id === viewedId;
          const content = (
            <>
              <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary/40">
                {g.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.thumbnail_url} alt="" className="size-full object-cover" />
                ) : (
                  <Film className="size-5 text-muted-foreground" />
                )}
                {playable && !viewed && (
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex">
                    <Play className="size-4 text-white" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm text-muted-foreground">
                  {new Date(g.created_at).toLocaleString()} · {g.camera_movement.replace("_", " ")} · {g.duration_seconds}s
                  {g.batch_id && " · batch"}
                </span>
                {showModel && <span className="block text-xs text-amber-400">{resolveVideoModel(g.model).label}</span>}
                {g.status === "failed" && g.error_message && (
                  <span className="block truncate text-xs text-destructive">{g.error_message}</span>
                )}
              </span>
              <Badge
                variant={
                  viewed ? "brand" : g.status === "completed" ? "success" : g.status === "failed" ? "destructive" : "warning"
                }
              >
                {viewed ? "Viewing" : STATUS_LABEL[g.status]}
              </Badge>
            </>
          );
          const rowClass = cn(
            "group flex w-full items-center gap-3 rounded-lg border border-transparent p-2",
            viewed && "border-primary/40 bg-primary/5"
          );
          return playable ? (
            <button key={g.id} type="button" onClick={() => onView(g.id)} className={cn(rowClass, "hover:bg-secondary/30")}>
              {content}
            </button>
          ) : (
            <div key={g.id} className={rowClass}>
              {content}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
