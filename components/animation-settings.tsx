"use client";

import { Palette, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { CameraMovement, Resolution } from "@/lib/supabase/types";
import { calculateCreditsCost } from "@/lib/stripe/credits";

export interface AnimationSettingsValue {
  prompt: string;
  cameraMovement: CameraMovement;
  motionIntensity: number;
  fps: number;
  resolution: Resolution;
  colorize: boolean;
  durationSeconds: number;
}

const CAMERA_MOVEMENTS: { value: CameraMovement; label: string }[] = [
  { value: "static", label: "Static / idle motion" },
  { value: "pan_left", label: "Pan left" },
  { value: "pan_right", label: "Pan right" },
  { value: "zoom_in", label: "Zoom in" },
  { value: "zoom_out", label: "Zoom out" },
  { value: "dolly_in", label: "Dolly in" },
  { value: "orbit", label: "Orbit" },
];

const FPS_OPTIONS = [12, 24, 30, 60];

interface AnimationSettingsProps {
  value: AnimationSettingsValue;
  onChange: (value: AnimationSettingsValue) => void;
  disabled?: boolean;
}

export function AnimationSettings({
  value,
  onChange,
  disabled,
}: AnimationSettingsProps) {
  const update = <K extends keyof AnimationSettingsValue>(
    key: K,
    v: AnimationSettingsValue[K]
  ) => onChange({ ...value, [key]: v });

  const estimatedCost = calculateCreditsCost({
    durationSeconds: value.durationSeconds,
    resolution: value.resolution,
    colorize: value.colorize,
  });

  return (
    <fieldset disabled={disabled} className="space-y-6 disabled:opacity-60">
      <div className="space-y-2">
        <Label htmlFor="prompt">Motion prompt (optional)</Label>
        <Textarea
          id="prompt"
          placeholder="e.g. wind blowing through hair, dramatic lightning flash in the background"
          value={value.prompt}
          onChange={(e) => update("prompt", e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Camera movement</Label>
        <Select
          value={value.cameraMovement}
          onValueChange={(v) => update("cameraMovement", v as CameraMovement)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAMERA_MOVEMENTS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Animation intensity</Label>
          <span className="text-xs text-muted-foreground">
            {Math.round(value.motionIntensity * 100)}%
          </span>
        </div>
        <Slider
          value={[value.motionIntensity]}
          min={0}
          max={1}
          step={0.05}
          onValueChange={([v]) => update("motionIntensity", v)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Duration</Label>
          <span className="text-xs text-muted-foreground">
            {value.durationSeconds}s
          </span>
        </div>
        <Slider
          value={[value.durationSeconds]}
          min={2}
          max={10}
          step={1}
          onValueChange={([v]) => update("durationSeconds", v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>FPS</Label>
          <Select
            value={String(value.fps)}
            onValueChange={(v) => update("fps", Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FPS_OPTIONS.map((fps) => (
                <SelectItem key={fps} value={String(fps)}>
                  {fps} fps
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Resolution</Label>
          <Select
            value={value.resolution}
            onValueChange={(v) => update("resolution", v as Resolution)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1080p">1080p</SelectItem>
              <SelectItem value="4k">4K</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-primary" />
          <div>
            <p className="text-sm font-medium">Dynamic colorization</p>
            <p className="text-xs text-muted-foreground">
              AI-colorize black & white panels before animating
            </p>
          </div>
        </div>
        <Switch
          checked={value.colorize}
          onCheckedChange={(v) => update("colorize", v)}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-primary" />
          Estimated cost
        </span>
        <Badge variant="brand">{estimatedCost} credits</Badge>
      </div>
    </fieldset>
  );
}
