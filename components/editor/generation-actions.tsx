"use client";

import { Download, Loader2, Volume2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXPORT_RATIOS, RATIO_LABEL } from "@/components/editor/editor-constants";
import type { ExportRatio, GenerationExportRow, GenerationRow } from "@/lib/supabase/types";

export function GenerationActions({
  generation,
  exports,
  pendingActions,
  onUpscale,
  onAudio,
  onExport,
}: {
  generation: GenerationRow;
  exports: GenerationExportRow[];
  pendingActions: Record<string, boolean>;
  onUpscale: () => void;
  onAudio: () => void;
  onExport: (ratio: ExportRatio) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/10 p-4">
      <div className="flex flex-wrap gap-2">
        {generation.resolution !== "4k" && !generation.upscaled_video_url && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pendingActions[`upscale-${generation.id}`]}
            onClick={onUpscale}
          >
            {pendingActions[`upscale-${generation.id}`] ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            Upscale to 4K
          </Button>
        )}
        {!generation.audio_url && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pendingActions[`audio-${generation.id}`]}
            onClick={onAudio}
          >
            {pendingActions[`audio-${generation.id}`] ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Volume2 className="size-4" />
            )}
            Add AI sound
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Export for other channels</p>
        <div className="flex flex-wrap gap-2">
          {EXPORT_RATIOS.map((ratio) => {
            const existing = exports.find((e) => e.ratio === ratio);
            const key = `export-${generation.id}-${ratio}`;
            const isPending = pendingActions[key] || existing?.status === "pending" || existing?.status === "processing";

            if (existing?.status === "completed" && existing.video_url) {
              return (
                <a key={ratio} href={existing.video_url} download target="_blank" rel="noreferrer">
                  <Button type="button" size="sm" variant="secondary">
                    <Download className="size-4" />
                    {RATIO_LABEL[ratio]}
                  </Button>
                </a>
              );
            }

            return (
              <Button
                key={ratio}
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => onExport(ratio)}
              >
                {isPending && <Loader2 className="size-4 animate-spin" />}
                {RATIO_LABEL[ratio]}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
