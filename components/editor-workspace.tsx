"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  deletePanel,
  getGeneration,
  getGenerationExports,
  getMyCreditsBalance,
  getPanelExtractionResult,
  requestAudio,
  requestExportRatio,
  requestPanelExtraction,
  requestUpscale,
  startBatchGeneration,
  startGeneration,
} from "@/app/(dashboard)/editor/[id]/actions";
import { useRealtimeGenerations } from "@/hooks/use-realtime-generations";
import { usePolling } from "@/hooks/use-polling";
import type { MangaPanel } from "@/components/manga-uploader";
import type { AnimationSettingsValue } from "@/components/animation-settings";
import {
  DEFAULT_SETTINGS,
  ENHANCEMENT_MESSAGES,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  RATIO_LABEL,
} from "@/components/editor/editor-constants";
import { EditorHeader } from "@/components/editor/editor-header";
import { PanelImportCard } from "@/components/editor/panel-import-card";
import { PreviewCard } from "@/components/editor/preview-card";
import { RenderHistoryCard } from "@/components/editor/render-history-card";
import { SettingsPanel } from "@/components/editor/settings-panel";
import {
  enhancementPatch,
  getEnhancementState,
  type EnhancementKind,
} from "@/lib/generation/enhancement-status";
import { planAllows } from "@/lib/stripe/plans";
import type { ExportRatio, GenerationExportRow, GenerationRow, PlanId, ProjectRow } from "@/lib/supabase/types";

export function EditorWorkspace({
  project,
  initialGenerations,
  initialPanels,
  credits,
  userId,
  plan,
}: {
  project: ProjectRow;
  initialGenerations: GenerationRow[];
  /** The project's images from storage (uploads + split panels), newest first. */
  initialPanels: MangaPanel[];
  credits: number;
  userId: string;
  plan: PlanId;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const startPolling = usePolling();

  const [panels, setPanels] = useState<MangaPanel[]>(initialPanels);
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

  // What this tab already knows, so realtime updates only react to actual
  // transitions — the same row is updated many times (progress, watermark,
  // 4K, sound) and each update must not re-announce "ready".
  const generationsRef = useRef(generations);
  useEffect(() => {
    generationsRef.current = generations;
  }, [generations]);

  const refreshCredits = useCallback(async () => {
    setLocalCredits(await getMyCreditsBalance());
  }, []);

  const handleRealtimeChange = useCallback(
    async (generationId: string) => {
      const generation = await getGeneration(generationId);
      if (!generation) return;
      const previous = generationsRef.current.find((g) => g.id === generation.id);

      setGenerations((prev) => {
        const idx = prev.findIndex((g) => g.id === generation.id);
        if (idx === -1) return [generation, ...prev];
        const next = [...prev];
        next[idx] = generation;
        return next;
      });

      if (generation.status !== previous?.status) {
        if (generation.status === "completed") {
          toast.success("Your animation is ready!");
          router.refresh();
        } else if (generation.status === "failed") {
          toast.error(generation.error_message ?? "Generation failed. Credits refunded.");
          if (previous) setLocalCredits((c) => c + generation.credits_cost);
        }
      }

      if (!previous) {
        // A row this tab hadn't seen (a batch item, or our own render whose
        // event beat the action's response): its debit happened server-side,
        // so re-read the balance rather than adjusting a local guess.
        void refreshCredits();
        return;
      }
      for (const kind of ["upscale", "audio"] as const) {
        const status = getEnhancementState(generation, kind).status;
        if (status === getEnhancementState(previous, kind).status) continue;
        if (status === "completed") {
          toast.success(ENHANCEMENT_MESSAGES[kind].completed);
        } else if (status === "failed") {
          toast.error(ENHANCEMENT_MESSAGES[kind].failed);
          void refreshCredits();
        }
      }
    },
    [router, refreshCredits]
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

  async function handleRemove(id: string) {
    const panel = panels.find((p) => p.id === id);
    if (!panel) return;
    const { error } = await deletePanel(project.id, panel.path);
    if (error) {
      toast.error(error);
      return;
    }
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

      // Realtime may already have added this row if its event beat our response.
      setGenerations((prev) => (prev.some((g) => g.id === generation.id) ? prev : [generation, ...prev]));
      void refreshCredits();
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
        settings,
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
        setIsExtracting(false);
        return;
      }
      setLocalCredits(data.creditsBalance);

      startPolling(async (stop) => {
        const result = await getPanelExtractionResult(data.panelExtractionId);
        if (!result) return;
        if (result.status === "completed") {
          stop();
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
          stop();
          setIsExtracting(false);
          toast.error(result.errorMessage ?? "Panel extraction failed.");
        }
      }, {
        intervalMs: POLL_INTERVAL_MS,
        timeoutMs: POLL_TIMEOUT_MS,
        onTimeout: () => {
          setIsExtracting(false);
          toast.warning("Splitting this page is taking longer than expected. Please try again later.");
        },
      });
    } catch {
      setIsExtracting(false);
    }
  }

  async function handleEnhancement(kind: EnhancementKind, generationId: string) {
    const key = `${kind}-${generationId}`;
    setPendingActions((p) => ({ ...p, [key]: true }));
    const { data, error } = await (kind === "upscale" ? requestUpscale : requestAudio)(generationId);
    setPendingActions((p) => ({ ...p, [key]: false }));
    if (error || !data) {
      toast.error(error ?? "Could not start this job.");
      return;
    }
    setLocalCredits(data.creditsBalance);
    // Mirror the server-side claim now so the button stays disabled; realtime
    // then reports completion (button hidden) or failure (button back).
    const patch = enhancementPatch(kind, "processing", new Date().toISOString());
    setGenerations((prev) => prev.map((g) => (g.id === generationId ? { ...g, ...patch } : g)));
    toast.info(ENHANCEMENT_MESSAGES[kind].queued);
  }

  async function handleExport(generationId: string, ratio: ExportRatio) {
    const key = `export-${generationId}-${ratio}`;
    setPendingActions((p) => ({ ...p, [key]: true }));
    const { data, error } = await requestExportRatio(generationId, ratio);
    if (error || !data) {
      toast.error(error ?? "Could not queue export.");
      setPendingActions((p) => ({ ...p, [key]: false }));
      return;
    }
    setLocalCredits(data.creditsBalance);
    toast.info(`${RATIO_LABEL[ratio]} export queued.`);

    startPolling(async (stop) => {
      const rows = await getGenerationExports(generationId);
      setExportsByGeneration((prev) => ({ ...prev, [generationId]: rows }));
      const row = rows.find((r) => r.ratio === ratio);
      if (row?.status === "completed" || row?.status === "failed") {
        stop();
        setPendingActions((p) => ({ ...p, [key]: false }));
      }
    }, {
      intervalMs: POLL_INTERVAL_MS,
      timeoutMs: POLL_TIMEOUT_MS,
      onTimeout: () => {
        setPendingActions((p) => ({ ...p, [key]: false }));
        toast.warning(`The ${RATIO_LABEL[ratio]} export is taking longer than expected. Reload the page later to download it.`);
      },
    });
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
          canBatch={planAllows(plan, "batch")}
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
          onUpscale={(generationId) => handleEnhancement("upscale", generationId)}
          onAudio={(generationId) => handleEnhancement("audio", generationId)}
          onExport={handleExport}
          canUpscale={planAllows(plan, "upscale")}
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
          plan={plan}
        />
      </div>
    </div>
  );
}
