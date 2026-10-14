"use client";

import { Clapperboard, Loader2 } from "lucide-react";
import type { MangaPanel } from "@/components/manga-uploader";
import { VideoPlayer } from "@/components/video-player";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { GenerationActions } from "@/components/editor/generation-actions";
import { STATUS_LABEL } from "@/components/editor/editor-constants";
import type { ExportRatio, GenerationExportRow, GenerationRow } from "@/lib/supabase/types";

/**
 * Shows, in priority order: the in-flight render, the latest finished video
 * with its follow-up actions, the selected source panel, or an empty state.
 */
export function PreviewCard({
  projectTitle,
  renderingGeneration,
  latestCompleted,
  latestCompletedExports,
  selectedPanel,
  pendingActions,
  onUpscale,
  onAudio,
  onExport,
}: {
  projectTitle: string;
  renderingGeneration: GenerationRow | null;
  latestCompleted: GenerationRow | null;
  latestCompletedExports: GenerationExportRow[];
  selectedPanel: MangaPanel | null;
  pendingActions: Record<string, boolean>;
  onUpscale: (generationId: string) => void;
  onAudio: (generationId: string) => void;
  onExport: (generationId: string, ratio: ExportRatio) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">2. Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderingGeneration ? (
          <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/10 p-6 text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-primary" />
            <p className="text-sm font-medium">{STATUS_LABEL[renderingGeneration.status]}</p>
            <Progress value={renderingGeneration.progress ?? 0} />
          </div>
        ) : latestCompleted?.output_video_url ? (
          <>
            <VideoPlayer
              src={latestCompleted.output_video_url}
              poster={latestCompleted.thumbnail_url}
              downloadFileName={`${projectTitle.replace(/\s+/g, "-").toLowerCase()}.mp4`}
            />
            <GenerationActions
              generation={latestCompleted}
              exports={latestCompletedExports}
              pendingActions={pendingActions}
              onUpscale={() => onUpscale(latestCompleted.id)}
              onAudio={() => onAudio(latestCompleted.id)}
              onExport={(ratio) => onExport(latestCompleted.id, ratio)}
            />
          </>
        ) : selectedPanel ? (
          <div className="overflow-hidden rounded-xl border border-border/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedPanel.url} alt="Selected panel" className="w-full object-contain" />
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border/60 text-muted-foreground">
            <Clapperboard className="size-8" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
