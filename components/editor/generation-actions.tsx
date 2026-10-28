"use client";

import { Download, Loader2, Volume2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXPORT_RATIOS, RATIO_LABEL } from "@/components/editor/editor-constants";
import { isEnhancementRunning } from "@/lib/generation/enhancement-status";
import Link from "next/link";
import type { ExportRatio, GenerationExportRow, GenerationRow } from "@/lib/supabase/types";

export function GenerationActions({
  generation,
  exports,
  pendingActions,
  onUpscale,
  onAudio,
  onExport,
  canUpscale,
  canAddAudio,
}: {
  generation: GenerationRow;
  exports: GenerationExportRow[];
  pendingActions: Record<string, boolean>;
  onUpscale: () => void;
  onAudio: () => void;
  onExport: (ratio: ExportRatio) => void;
  /** 4K upscaling is a Studio+ feature; other plans get an upgrade link instead. */
  canUpscale: boolean;
  /** Hidden until the server has an ElevenLabs key. */
  canAddAudio: boolean;
}) {
  // Busy while the click is in flight, then while the job runs server-side (survives reloads).
  const upscaleBusy = pendingActions[`upscale-${generation.id}`] || isEnhancementRunning(generation, "upscale");
  const audioBusy = pendingActions[`audio-${generation.id}`] || isEnhancementRunning(generation, "audio");

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/10 p-4">
      <div className="flex flex-wrap gap-2">
        {generation.resolution !== "4k" && !generation.upscaled_video_url && !canUpscale && (
          <Button asChild type="button" size="sm" variant="outline">
            <Link href="/billing">
              <Wand2 className="size-4" />
              Upscale to 4K · Studio
            </Link>
          </Button>
        )}
        {generation.resolution !== "4k" && !generation.upscaled_video_url && canUpscale && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={upscaleBusy}
            onClick={onUpscale}
          >
            {upscaleBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            Upscale to 4K
          </Button>
        )}
        {!generation.audio_url && canAddAudio && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={audioBusy}
            onClick={onAudio}
          >
            {audioBusy ? (
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
