"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Clapperboard, Film, Loader2, Trash2, X } from "lucide-react";
import { createEpisode, deleteEpisode, getEpisode } from "@/app/(dashboard)/editor/[id]/episode-actions";
import { usePolling } from "@/hooks/use-polling";
import { VideoPlayer } from "@/components/video-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "@/components/editor/editor-constants";
import {
  EPISODE_FORMATS,
  EPISODE_TRANSITIONS,
  MAX_EPISODE_CAPTION,
  MAX_EPISODE_CLIPS,
  MAX_EPISODE_TITLE,
} from "@/lib/generation/episodes";
import { cn } from "@/lib/utils";
import type { EpisodeRow, EpisodeTransition, ExportRatio, GenerationRow } from "@/lib/supabase/types";

type Pick = { generationId: string; caption: string };

/**
 * "Chapter → finished video": pick finished renders in playback order, add
 * an optional title card and captions, and get one video ready to post.
 */
export function EpisodeCard({
  projectId,
  projectTitle,
  renders,
  initialEpisodes,
}: {
  projectId: string;
  projectTitle: string;
  /** Finished renders, newest first. */
  renders: GenerationRow[];
  initialEpisodes: EpisodeRow[];
}) {
  const startPolling = usePolling();
  const [picks, setPicks] = useState<Pick[]>([]);
  const [title, setTitle] = useState("");
  const [aspectRatio, setAspectRatio] = useState<ExportRatio>("9:16");
  const [transition, setTransition] = useState<EpisodeTransition>("fade");
  const [episodes, setEpisodes] = useState<EpisodeRow[]>(initialEpisodes);
  const [isBuilding, setIsBuilding] = useState(false);

  const renderById = new Map(renders.map((r) => [r.id, r]));
  // A render deleted or no longer finished drops out of the selection.
  const validPicks = picks.filter((p) => renderById.has(p.generationId));

  function upsertEpisode(episode: EpisodeRow) {
    setEpisodes((prev) => [episode, ...prev.filter((e) => e.id !== episode.id)]);
  }

  function watch(episodeId: string) {
    startPolling(
      async (stop) => {
        const episode = await getEpisode(episodeId);
        if (!episode) return stop();
        upsertEpisode(episode);
        if (episode.status === "completed") {
          stop();
          toast.success("Your episode is ready!");
        } else if (episode.status === "failed") {
          stop();
          toast.error(episode.error_message ?? "The episode couldn't be built.");
        }
      },
      {
        intervalMs: POLL_INTERVAL_MS,
        timeoutMs: POLL_TIMEOUT_MS * 2,
        onTimeout: () => toast.warning("The episode is taking longer than expected. Reload the page later to see it."),
      }
    );
  }

  // Episodes still building when the page loaded keep updating too.
  useEffect(() => {
    for (const episode of initialEpisodes) {
      if (episode.status === "pending" || episode.status === "processing") watch(episode.id);
    }
    // Only for what the page loaded with; new episodes are watched when created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(generationId: string) {
    setPicks((prev) => {
      if (prev.some((p) => p.generationId === generationId)) return prev.filter((p) => p.generationId !== generationId);
      if (prev.length >= MAX_EPISODE_CLIPS) {
        toast.error(`An episode can hold up to ${MAX_EPISODE_CLIPS} clips.`);
        return prev;
      }
      return [...prev, { generationId, caption: "" }];
    });
  }

  function move(index: number, delta: -1 | 1) {
    setPicks((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function build() {
    setIsBuilding(true);
    try {
      const { data, error } = await createEpisode(projectId, {
        title,
        aspectRatio,
        transition,
        clips: validPicks.map((p) => ({ generationId: p.generationId, caption: p.caption })),
      });
      if (error || !data) {
        toast.error(error ?? "Could not start building the episode.");
        return;
      }
      upsertEpisode(data);
      watch(data.id);
      toast.info("Building your episode — this takes a minute or two.");
    } finally {
      setIsBuilding(false);
    }
  }

  async function remove(episodeId: string) {
    const { error } = await deleteEpisode(episodeId);
    if (error) {
      toast.error(error);
      return;
    }
    setEpisodes((prev) => prev.filter((e) => e.id !== episodeId));
  }

  const slug = projectTitle.replace(/\s+/g, "-").toLowerCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clapperboard className="size-4 text-primary" />
          4. Build an episode
        </CardTitle>
        <CardDescription>
          Put finished renders in order and get one video ready to post — with a title card, captions and smooth
          transitions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {renders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
            Finished renders will show up here. Render a few panels first.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label>1 · Tap renders in the order they should play</Label>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {renders.map((r) => {
                  const order = validPicks.findIndex((p) => p.generationId === r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggle(r.id)}
                      className={cn(
                        "relative aspect-square overflow-hidden rounded-lg border-2 bg-secondary/30",
                        order >= 0 ? "border-primary" : "border-transparent hover:border-border"
                      )}
                      aria-label={order >= 0 ? `Remove clip ${order + 1}` : "Add to episode"}
                    >
                      {r.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.thumbnail_url} alt="" className="size-full object-cover" />
                      ) : (
                        <Film className="m-auto size-5 text-muted-foreground" />
                      )}
                      {order >= 0 && (
                        <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full brand-gradient-bg text-[11px] font-semibold text-white">
                          {order + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {validPicks.length > 0 && (
              <div className="space-y-2">
                <Label>2 · Captions (optional)</Label>
                {validPicks.map((p, i) => (
                  <div key={p.generationId} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
                    <Input
                      value={p.caption}
                      maxLength={MAX_EPISODE_CAPTION}
                      placeholder="Dialogue or narration for this clip"
                      onChange={(e) =>
                        setPicks((prev) => prev.map((x) => (x.generationId === p.generationId ? { ...x, caption: e.target.value } : x)))
                      }
                    />
                    <Button type="button" size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => move(i, 1)}
                      disabled={i === validPicks.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => toggle(p.generationId)} aria-label="Remove">
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="episode-title">3 · Title card (optional)</Label>
                <Input
                  id="episode-title"
                  value={title}
                  maxLength={MAX_EPISODE_TITLE}
                  placeholder="e.g. Chapter 1 — The Duel"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Format</Label>
                <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as ExportRatio)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EPISODE_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transitions</Label>
                <Select value={transition} onValueChange={(v) => setTransition(v as EpisodeTransition)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EPISODE_TRANSITIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="button" variant="brand" className="w-full" disabled={validPicks.length === 0 || isBuilding} onClick={build}>
              {isBuilding ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
              {validPicks.length === 0
                ? "Pick renders to build an episode"
                : `Build episode · ${validPicks.length} clip${validPicks.length === 1 ? "" : "s"}`}
            </Button>
          </>
        )}

        {episodes.length > 0 && (
          <div className="space-y-4 border-t border-border/60 pt-4">
            <p className="text-sm font-medium">Your episodes</p>
            {episodes.map((e) => (
              <div key={e.id} className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {e.title || "Untitled episode"} · {e.aspect_ratio} · {e.clips.length} clip{e.clips.length === 1 ? "" : "s"}
                    {e.duration_seconds ? ` · ${Math.round(e.duration_seconds)}s` : ""}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant={e.status === "completed" ? "success" : e.status === "failed" ? "destructive" : "warning"}>
                      {e.status === "completed" ? "Ready" : e.status === "failed" ? "Failed" : "Building…"}
                    </Badge>
                    {e.status !== "pending" && e.status !== "processing" && (
                      <Button type="button" size="icon" variant="ghost" onClick={() => remove(e.id)} aria-label="Delete episode">
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </span>
                </div>
                {e.status === "completed" && e.output_video_url && (
                  <VideoPlayer
                    key={e.output_video_url}
                    src={e.output_video_url}
                    poster={e.thumbnail_url}
                    downloadFileName={`${slug}-episode-${e.id.slice(0, 8)}.mp4`}
                    className={e.aspect_ratio === "9:16" ? "mx-auto max-w-xs" : undefined}
                  />
                )}
                {e.status === "failed" && e.error_message && <p className="text-xs text-destructive">{e.error_message}</p>}
                {(e.status === "pending" || e.status === "processing") && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Assembling clips…
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
