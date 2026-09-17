"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Clapperboard,
  Coins,
  Download,
  Layers,
  Loader2,
  Scissors,
  Sparkles,
  Volume2,
  Wand2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getGeneration,
  getGenerationExports,
  getPanelExtractionResult,
  requestAudio,
  requestExportRatio,
  requestPanelExtraction,
  requestUpscale,
  startBatchGeneration,
  startGeneration,
} from "@/app/(dashboard)/editor/[id]/actions";
import { useRealtimeGenerations } from "@/hooks/use-realtime-generations";
import { MangaUploader, type MangaPanel } from "@/components/manga-uploader";
import { AnimationSettings, type AnimationSettingsValue } from "@/components/animation-settings";
import { VideoPlayer } from "@/components/video-player";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { ExportRatio, GenerationExportRow, GenerationRow, ProjectRow } from "@/lib/supabase/types";

const DEFAULT_SETTINGS: AnimationSettingsValue = {
  prompt: "",
  cameraMovement: "zoom_in",
  motionIntensity: 0.5,
  fps: 24,
  resolution: "1080p",
  colorize: false,
  removeText: false,
  durationSeconds: 4,
};

const STATUS_LABEL: Record<GenerationRow["status"], string> = {
  pending: "Queued",
  processing: "Rendering…",
  completed: "Completed",
  failed: "Failed",
};

const EXPORT_RATIOS: ExportRatio[] = ["16:9", "9:16", "1:1"];
const RATIO_LABEL: Record<ExportRatio, string> = {
  "16:9": "YouTube (16:9)",
  "9:16": "TikTok / Reels (9:16)",
  "1:1": "Instagram (1:1)",
};

export function EditorWorkspace({
  project,
  initialGenerations,
  credits,
  userId,
}: {
  project: ProjectRow;
  initialGenerations: GenerationRow[];
  credits: number;
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [panels, setPanels] = useState<MangaPanel[]>(
    initialGenerations
      .map((g) => ({ id: g.id, path: g.source_image_url, url: g.source_image_url, name: "Uploaded panel" }))
      .filter((p, idx, arr) => arr.findIndex((x) => x.path === p.path) === idx)
  );
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(panels[0]?.id ?? null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [settings, setSettings] = useState<AnimationSettingsValue>(DEFAULT_SETTINGS);
  const [generations, setGenerations] = useState<GenerationRow[]>(initialGenerations);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localCredits, setLocalCredits] = useState(credits);
  const [exportsByGeneration, setExportsByGeneration] = useState<Record<string, GenerationExportRow[]>>({});
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});

  const selectedPanel = panels.find((p) => p.id === selectedPanelId) ?? null;
  const latestGeneration = generations[0] ?? null;
  const latestCompleted = generations.find((g) => g.status === "completed") ?? null;
  const isRendering = latestGeneration && latestGeneration.status !== "completed" && latestGeneration.status !== "failed";

  const handleRealtimeChange = useCallback(
    async (generationId: string) => {
      const generation = await getGeneration(generationId);
      if (!generation) return;

      setGenerations((prev) => {
        const idx = prev.findIndex((g) => g.id === generation.id);
        if (idx === -1) return [generation, ...prev];
        const next = [...prev];
        next[idx] = generation;
        return next;
      });

      if (generation.status === "completed") {
        toast.success("Your animation is ready!");
        router.refresh();
      } else if (generation.status === "failed") {
        toast.error(generation.error_message ?? "Generation failed. Credits refunded.");
        setLocalCredits((c) => c + generation.credits_cost);
      }
    },
    [router]
  );

  useRealtimeGenerations({ projectId: project.id, onChange: handleRealtimeChange });

  async function handleUpload(files: File[]) {
    setIsUploading(true);
    try {
      const uploaded: MangaPanel[] = [];
      for (const file of files) {
        const path = `${userId}/${project.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage
          .from("manga-sources")
          .upload(path, file, { cacheControl: "3600", upsert: false });

        if (error) {
          toast.error(`Upload failed: ${error.message}`);
          continue;
        }

        const { data } = await supabase.storage.from("manga-sources").createSignedUrl(path, 3600);
        uploaded.push({ id: crypto.randomUUID(), path, url: data?.signedUrl ?? "", name: file.name });
      }

      setPanels((prev) => [...uploaded, ...prev]);
      if (uploaded.length && !selectedPanelId) {
        setSelectedPanelId(uploaded[0].id);
      }
    } finally {
      setIsUploading(false);
    }
  }

  function handleRemove(id: string) {
    setPanels((prev) => prev.filter((p) => p.id !== id));
    if (selectedPanelId === id) setSelectedPanelId(null);
    setSelectedPanelIds((prev) => prev.filter((p) => p !== id));
  }

  function handlePanelSelect(id: string) {
    if (batchMode) {
      setSelectedPanelIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    } else {
      setSelectedPanelId(id);
    }
  }

  async function handleGenerate() {
    if (!selectedPanel) {
      toast.error("Select a manga panel first.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: generation, error } = await startGeneration({
        projectId: project.id,
        sourceImagePath: selectedPanel.path,
        settings,
      });

      if (error || !generation) {
        toast.error(error ?? "Could not start generation.");
        return;
      }

      setGenerations((prev) => [generation, ...prev]);
      setLocalCredits((c) => c - generation.credits_cost);
      toast.info("Render started — this usually takes 30–90 seconds.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBatchGenerate() {
    if (selectedPanelIds.length === 0) {
      toast.error("Select at least one panel for batch rendering.");
      return;
    }
    setIsSubmitting(true);
    try {
      const paths = panels.filter((p) => selectedPanelIds.includes(p.id)).map((p) => p.path);
      const { data, error } = await startBatchGeneration({
        projectId: project.id,
        sourceImagePaths: paths,
        settings: { ...settings, removeText: settings.removeText },
      });

      if (error || !data) {
        toast.error(error ?? "Could not start batch render.");
        return;
      }

      toast.info(`Batch queued: ${paths.length} panels rendering in the background.`);
      setSelectedPanelIds([]);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExtractPanels() {
    if (!selectedPanel) {
      toast.error("Select a full manga page to split first.");
      return;
    }
    setIsExtracting(true);
    try {
      const { data, error } = await requestPanelExtraction(project.id, selectedPanel.path);
      if (error || !data) {
        toast.error(error ?? "Could not queue panel extraction.");
        return;
      }

      const poll = setInterval(async () => {
        const result = await getPanelExtractionResult(data.panelExtractionId);
        if (!result) return;
        if (result.status === "completed") {
          clearInterval(poll);
          setIsExtracting(false);
          const newPanels = result.panels.map((p) => ({
            id: crypto.randomUUID(),
            path: p.path,
            url: p.url,
            name: "Extracted panel",
          }));
          setPanels((prev) => [...newPanels, ...prev]);
          toast.success(`Split into ${newPanels.length} panels.`);
        } else if (result.status === "failed") {
          clearInterval(poll);
          setIsExtracting(false);
          toast.error(result.errorMessage ?? "Panel extraction failed.");
        }
      }, 4000);
    } catch {
      setIsExtracting(false);
    }
  }

  async function handleUpscale(generationId: string) {
    setPendingActions((p) => ({ ...p, [`upscale-${generationId}`]: true }));
    const { error } = await requestUpscale(generationId);
    if (error) toast.error(error);
    else toast.info("4K upscale queued.");
  }

  async function handleAudio(generationId: string) {
    setPendingActions((p) => ({ ...p, [`audio-${generationId}`]: true }));
    const { error } = await requestAudio(generationId);
    if (error) toast.error(error);
    else toast.info("AI sound design queued.");
  }

  async function handleExport(generationId: string, ratio: ExportRatio) {
    const key = `export-${generationId}-${ratio}`;
    setPendingActions((p) => ({ ...p, [key]: true }));
    const { error } = await requestExportRatio(generationId, ratio);
    if (error) {
      toast.error(error);
      setPendingActions((p) => ({ ...p, [key]: false }));
      return;
    }
    toast.info(`${RATIO_LABEL[ratio]} export queued.`);

    const poll = setInterval(async () => {
      const rows = await getGenerationExports(generationId);
      setExportsByGeneration((prev) => ({ ...prev, [generationId]: rows }));
      const row = rows.find((r) => r.ratio === ratio);
      if (row?.status === "completed" || row?.status === "failed") {
        clearInterval(poll);
        setPendingActions((p) => ({ ...p, [key]: false }));
      }
    }, 4000);
  }

  const latestCompletedId = latestCompleted?.id;
  useEffect(() => {
    if (latestCompletedId) {
      getGenerationExports(latestCompletedId).then((rows) =>
        setExportsByGeneration((prev) => ({ ...prev, [latestCompletedId]: rows }))
      );
    }
  }, [latestCompletedId]);

  const progressValue = latestGeneration?.progress ?? 0;

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{project.title}</h1>
            <Badge variant="secondary" className="mt-1 capitalize">
              {project.status}
            </Badge>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <Coins className="size-3.5 text-primary" />
            {localCredits.toLocaleString()} credits
          </Badge>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">1. Import manga panels</CardTitle>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedPanel || isExtracting || batchMode}
                onClick={handleExtractPanels}
              >
                {isExtracting ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
                Split page into panels
              </Button>
              <div className="flex items-center gap-2">
                <Label htmlFor="batch-mode" className="text-xs text-muted-foreground">
                  Batch mode
                </Label>
                <Switch
                  id="batch-mode"
                  checked={batchMode}
                  onCheckedChange={(v) => {
                    setBatchMode(v);
                    setSelectedPanelIds([]);
                  }}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <MangaUploader
              panels={panels}
              selectedId={selectedPanelId}
              selectedIds={selectedPanelIds}
              multiSelect={batchMode}
              onSelect={handlePanelSelect}
              onUpload={handleUpload}
              onRemove={handleRemove}
              isUploading={isUploading}
            />
            {batchMode && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <span className="flex items-center gap-2 text-sm">
                  <Layers className="size-4 text-primary" />
                  {selectedPanelIds.length} panel{selectedPanelIds.length === 1 ? "" : "s"} selected for a whole-chapter batch render
                </span>
                <Button size="sm" variant="brand" disabled={isSubmitting} onClick={handleBatchGenerate}>
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  Generate batch
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isRendering ? (
              <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/10 p-6 text-center">
                <Loader2 className="mx-auto size-6 animate-spin text-primary" />
                <p className="text-sm font-medium">{STATUS_LABEL[latestGeneration!.status]}</p>
                <Progress value={progressValue} />
              </div>
            ) : latestCompleted?.output_video_url ? (
              <>
                <VideoPlayer
                  src={latestCompleted.output_video_url}
                  poster={latestCompleted.thumbnail_url}
                  downloadFileName={`${project.title.replace(/\s+/g, "-").toLowerCase()}.mp4`}
                />
                <GenerationActions
                  generation={latestCompleted}
                  exports={exportsByGeneration[latestCompleted.id] ?? []}
                  pendingActions={pendingActions}
                  onUpscale={() => handleUpscale(latestCompleted.id)}
                  onAudio={() => handleAudio(latestCompleted.id)}
                  onExport={(ratio) => handleExport(latestCompleted.id, ratio)}
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

        {generations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Render history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {generations.map((g) => (
                <div key={g.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {new Date(g.created_at).toLocaleString()} · {g.camera_movement.replace("_", " ")}
                      {g.batch_id && " · batch"}
                    </span>
                    <Badge
                      variant={
                        g.status === "completed"
                          ? "success"
                          : g.status === "failed"
                          ? "destructive"
                          : "warning"
                      }
                    >
                      {STATUS_LABEL[g.status]}
                    </Badge>
                  </div>
                  <Separator className="mt-3" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Animation settings</CardTitle>
          </CardHeader>
          <CardContent>
            <AnimationSettings value={settings} onChange={setSettings} disabled={isSubmitting} />
          </CardContent>
        </Card>

        {!batchMode && (
          <Button
            size="lg"
            variant="brand"
            className="w-full"
            disabled={!selectedPanel || isSubmitting}
            onClick={handleGenerate}
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate animation
          </Button>
        )}
      </div>
    </div>
  );
}

function GenerationActions({
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
