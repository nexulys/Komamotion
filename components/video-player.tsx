"use client";

import { useRef, useState } from "react";
import { Download, Pause, Play, Repeat, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  src: string;
  poster?: string | null;
  className?: string;
  downloadFileName?: string;
}

export function VideoPlayer({
  src,
  poster,
  className,
  downloadFileName = "komamotion-export.mp4",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [muted, setMuted] = useState(true);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/60 bg-black",
        className
      )}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        loop={loop}
        muted={muted}
        playsInline
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="aspect-video w-full cursor-pointer bg-black object-contain"
      />

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 py-3 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 text-white hover:bg-white/10 hover:text-white"
            onClick={togglePlay}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              "size-8 text-white hover:bg-white/10 hover:text-white",
              loop && "text-primary"
            )}
            onClick={() => setLoop((v) => !v)}
            title="Toggle loop"
          >
            <Repeat className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 text-white hover:bg-white/10 hover:text-white"
            onClick={() => setMuted((v) => !v)}
            title="Toggle mute"
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
        </div>
        <a href={src} download={downloadFileName}>
          <Button type="button" size="sm" variant="brand">
            <Download className="size-4" />
            Download
          </Button>
        </a>
      </div>
    </div>
  );
}
