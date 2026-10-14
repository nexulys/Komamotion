"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import type { MangaPanel } from "@/components/manga-uploader";
import type { AnimationSettingsValue } from "@/components/animation-settings";
import { DEFAULT_SETTINGS, RATIO_LABEL } from "@/components/editor/editor-constants";
import { EditorHeader } from "@/components/editor/editor-header";
import { PanelImportCard } from "@/components/editor/panel-import-card";
import { PreviewCard } from "@/components/editor/preview-card";
import { RenderHistoryCard } from "@/components/editor/render-history-card";
import { SettingsPanel } from "@/components/editor/settings-panel";
import type { ExportRatio, GenerationExportRow, GenerationRow, ProjectRow } from "@/lib/supabase/types";

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
  const renderingGeneration =
    latestGeneration && latestGeneration.status !== "completed" && latestGeneration.status !== "failed"
      ? latestGeneration
      : null;

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

  function handleBatchModeChange(enabled: boolean) {
    setBatchMode(enabled);
    setSelectedPanelIds([]);
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

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <EditorHeader project={project} credits={localCredits} />

        <PanelImportCard
          panels={panels}
          selectedPanelId={selectedPanelId}
          selectedPanelIds={selectedPanelIds}
          hasSelectedPanel={!!selectedPanel}
          batchMode={batchMode}
          isUploading={isUploading}
          isExtracting={isExtracting}
          isSubmitting={isSubmitting}
          onBatchModeChange={handleBatchModeChange}
          onExtractPanels={handleExtractPanels}
          onSelectPanel={handlePanelSelect}
          onUpload={handleUpload}
          onRemovePanel={handleRemove}
          onBatchGenerate={handleBatchGenerate}
        />

        <PreviewCard
          projectTitle={project.title}
          renderingGeneration={renderingGeneration}
          latestCompleted={latestCompleted}
          latestCompletedExports={latestCompleted ? exportsByGeneration[latestCompleted.id] ?? [] : []}
          selectedPanel={selectedPanel}
          pendingActions={pendingActions}
          onUpscale={handleUpscale}
          onAudio={handleAudio}
          onExport={handleExport}
        />

        {generations.length > 0 && <RenderHistoryCard generations={generations} />}
      </div>

      <div className="space-y-6">
        <SettingsPanel
          settings={settings}
          onSettingsChange={setSettings}
          batchMode={batchMode}
          hasSelectedPanel={!!selectedPanel}
          isSubmitting={isSubmitting}
          onGenerate={handleGenerate}
        />
      </div>
    </div>
  );
}
