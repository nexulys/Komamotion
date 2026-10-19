"use client";

import { Layers, Loader2, Scissors } from "lucide-react";
import { MangaUploader, type MangaPanel } from "@/components/manga-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import Link from "next/link";
import { Label } from "@/components/ui/label";

export function PanelImportCard({
  panels,
  selectedPanelId,
  selectedPanelIds,
  hasSelectedPanel,
  batchMode,
  canBatch,
  isUploading,
  isExtracting,
  isSubmitting,
  onBatchModeChange,
  onExtractPanels,
  onSelectPanel,
  onUpload,
  onRemovePanel,
  onBatchGenerate,
}: {
  panels: MangaPanel[];
  selectedPanelId: string | null;
  selectedPanelIds: string[];
  hasSelectedPanel: boolean;
  batchMode: boolean;
  /** Batch rendering is a Pro feature; other plans see the switch locked. */
  canBatch: boolean;
  isUploading: boolean;
  isExtracting: boolean;
  isSubmitting: boolean;
  onBatchModeChange: (enabled: boolean) => void;
  onExtractPanels: () => void;
  onSelectPanel: (id: string) => void;
  onUpload: (files: File[]) => Promise<void>;
  onRemovePanel: (id: string) => void;
  onBatchGenerate: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">1. Import manga panels</CardTitle>
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasSelectedPanel || isExtracting || batchMode}
            onClick={onExtractPanels}
          >
            {isExtracting ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
            Split page into panels
          </Button>
          <div className="flex items-center gap-2">
            <Label htmlFor="batch-mode" className="text-xs text-muted-foreground">
              Batch mode
            </Label>
            {canBatch ? (
              <Switch id="batch-mode" checked={batchMode} onCheckedChange={onBatchModeChange} />
            ) : (
              <Link href="/billing" className="text-[10px] font-medium text-primary hover:underline">
                Pro
              </Link>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <MangaUploader
          panels={panels}
          selectedId={selectedPanelId}
          selectedIds={selectedPanelIds}
          multiSelect={batchMode}
          onSelect={onSelectPanel}
          onUpload={onUpload}
          onRemove={onRemovePanel}
          isUploading={isUploading}
        />
        {batchMode && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="flex items-center gap-2 text-sm">
              <Layers className="size-4 text-primary" />
              {selectedPanelIds.length} panel{selectedPanelIds.length === 1 ? "" : "s"} selected for a whole-chapter batch render
            </span>
            <Button size="sm" variant="brand" disabled={isSubmitting} onClick={onBatchGenerate}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Generate batch
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
