"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clapperboard, Coins, Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { startGeneration, refreshGenerationStatus } from "@/app/(dashboard)/editor/[id]/actions";
import { MangaUploader, type MangaPanel } from "@/components/manga-uploader";
import { AnimationSettings, type AnimationSettingsValue } from "@/components/animation-settings";
import { VideoPlayer } from "@/components/video-player";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { GenerationRow, ProjectRow } from "@/lib/supabase/types";

const DEFAULT_SETTINGS: AnimationSettingsValue = {
  prompt: "",
  cameraMovement: "zoom_in",
  motionIntensity: 0.5,
  fps: 24,
  resolution: "1080p",
  colorize: false,
  durationSeconds: 4,
};

const STATUS_LABEL: Record<GenerationRow["status"], string> = {
  pending: "Queued",
  processing: "Rendering…",
  completed: "Completed",
  failed: "Failed",
};

export function EditorWorkspace({
  project,
  initialGenerations,
  credits,
}: {
  project: ProjectRow;
  initialGenerations: GenerationRow[];
  credits: number;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [panels, setPanels] = useState<MangaPanel[]>(
    initialGenerations
      .map((g) => ({ id: g.id, url: g.source_image_url, name: "Uploaded panel" }))
      .filter((p, idx, arr) => arr.findIndex((x) => x.url === p.url) === idx)
  );
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(panels[0]?.id ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [settings, setSettings] = useState<AnimationSettingsValue>(DEFAULT_SETTINGS);
  const [generations, setGenerations] = useState<GenerationRow[]>(initialGenerations);
  const [activeId, setActiveId] = useState<string | null>(
    initialGenerations.find((g) => g.status === "pending" || g.status === "processing")?.id ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localCredits, setLocalCredits] = useState(credits);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedPanel = panels.find((p) => p.id === selectedPanelId) ?? null;
  const activeGeneration = generations.find((g) => g.id === activeId) ?? null;
  const latestCompleted = generations.find((g) => g.status === "completed") ?? null;

  useEffect(() => {
    if (!activeId) return;
    const current = generations.find((g) => g.id === activeId);
    if (!current || current.status === "completed" || current.status === "failed") {
      return;
    }

    pollRef.current = setInterval(async () => {
      const { generation, error } = await refreshGenerationStatus(activeId);
      if (error) return;
      if (generation) {
        setGenerations((prev) =>
          prev.map((g) => (g.id === generation.id ? generation : g))
        );
        if (generation.status === "completed") {
          toast.success("Your animation is ready!");
          router.refresh();
        } else if (generation.status === "failed") {
          toast.error(generation.error_message ?? "Generation failed. Credits refunded.");
          setLocalCredits((c) => c + generation.credits_cost);
        }
      }
    }, 4000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeId, generations, router]);

  async function handleUpload(files: File[]) {
    setIsUploading(true);
    try {
      const uploaded: MangaPanel[] = [];
      for (const file of files) {
        const path = `${project.id}/${crypto.randomUUID()}-${file.name}`;
        const { error } = await supabase.storage
          .from("manga-sources")
          .upload(path, file, { cacheControl: "3600", upsert: false });

        if (error) {
          toast.error(`Upload failed: ${error.message}`);
          continue;
        }

        const { data } = supabase.storage.from("manga-sources").getPublicUrl(path);
        uploaded.push({ id: crypto.randomUUID(), url: data.publicUrl, name: file.name });
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
  }

  async function handleGenerate() {
    if (!selectedPanel) {
      toast.error("Select a manga panel first.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { generation, error } = await startGeneration({
        projectId: project.id,
        sourceImageUrl: selectedPanel.url,
        settings,
      });

      if (error || !generation) {
        toast.error(error ?? "Could not start generation.");
        return;
      }

      setGenerations((prev) => [generation, ...prev]);
      setActiveId(generation.id);
      setLocalCredits((c) => c - generation.credits_cost);
      toast.info("Render started — this usually takes 30–90 seconds.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const progressValue =
    activeGeneration?.status === "pending"
      ? 15
      : activeGeneration?.status === "processing"
      ? 65
      : activeGeneration?.status === "completed"
      ? 100
      : 0;

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
          <CardHeader>
            <CardTitle className="text-base">1. Import manga panels</CardTitle>
          </CardHeader>
          <CardContent>
            <MangaUploader
              panels={panels}
              selectedId={selectedPanelId}
              onSelect={setSelectedPanelId}
              onUpload={handleUpload}
              onRemove={handleRemove}
              isUploading={isUploading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {activeGeneration && activeGeneration.status !== "completed" ? (
              <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/10 p-6 text-center">
                <Loader2 className="mx-auto size-6 animate-spin text-primary" />
                <p className="text-sm font-medium">{STATUS_LABEL[activeGeneration.status]}</p>
                <Progress value={progressValue} />
              </div>
            ) : latestCompleted?.output_video_url ? (
              <VideoPlayer
                src={latestCompleted.output_video_url}
                poster={latestCompleted.thumbnail_url}
                downloadFileName={`${project.title.replace(/\s+/g, "-").toLowerCase()}.mp4`}
              />
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

        <Button
          size="lg"
          variant="brand"
          className="w-full"
          disabled={!selectedPanel || isSubmitting}
          onClick={handleGenerate}
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Generate animation
        </Button>
      </div>
    </div>
  );
}
