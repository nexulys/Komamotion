"use client";

import Link from "next/link";
import { Eraser, Lock, Palette, Sparkles } from "lucide-react";
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
import type { CameraMovement, PlanId, Resolution } from "@/lib/supabase/types";
import { cheapestPlanWith, planAllows, type PlanFeature } from "@/lib/stripe/plans";
import { calculateCreditsCost } from "@/lib/stripe/credits";
import { VIDEO_DURATIONS, VIDEO_FPS } from "@/lib/ai/render-options";

export interface AnimationSettingsValue {
  prompt: string;
  cameraMovement: CameraMovement;
  motionIntensity: number;
  fps: number;
  resolution: Resolution;
  colorize: boolean;
  removeText: boolean;
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


interface AnimationSettingsProps {
  value: AnimationSettingsValue;
  onChange: (value: AnimationSettingsValue) => void;
  disabled?: boolean;
  /** Options outside this plan are shown locked, with an upgrade link (the server refuses them too). */
  plan?: PlanId;
}

/** Small "Studio" pill linking to Billing, shown next to options the plan doesn't include. */
function PlanLock({ feature }: { feature: PlanFeature }) {
  return (
    <Link href="/billing" className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10">
      <Lock className="size-3" />
      {cheapestPlanWith(feature).name}
    </Link>
  );
}

export function AnimationSettings({
  value,
  onChange,
  disabled,
  plan = "free",
}: AnimationSettingsProps) {
  const can4k = planAllows(plan, "4k");
  const canColorize = planAllows(plan, "colorize");
  const canRemoveText = planAllows(plan, "removeText");
  const update = <K extends keyof AnimationSettingsValue>(
    key: K,
    v: AnimationSettingsValue[K]
  ) => onChange({ ...value, [key]: v });

  const estimatedCost = calculateCreditsCost({
    durationSeconds: value.durationSeconds,
    resolution: value.resolution,
    colorize: value.colorize,
    removeText: value.removeText,
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
        <Label>Duration</Label>
        <Select
          value={String(value.durationSeconds)}
          onValueChange={(v) => update("durationSeconds", Number(v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_DURATIONS.map((seconds) => (
              <SelectItem key={seconds} value={String(seconds)}>
                {seconds} seconds
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              {VIDEO_FPS.map((fps) => (
                <SelectItem key={fps} value={String(fps)}>
                  {fps} fps
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">Resolution {!can4k && <PlanLock feature="4k" />}</Label>
          <Select
            value={value.resolution}
            onValueChange={(v) => update("resolution", v as Resolution)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1080p">1080p</SelectItem>
              <SelectItem value="4k" disabled={!can4k}>
                4K{!can4k && " (Studio+)"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-primary" />
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              Dynamic colorization {!canColorize && <PlanLock feature="colorize" />}
            </p>
            <p className="text-xs text-muted-foreground">
              AI-colorize black & white panels before animating
            </p>
          </div>
        </div>
        <Switch
          checked={value.colorize}
          disabled={!canColorize}
          onCheckedChange={(v) => update("colorize", v)}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Eraser className="size-4 text-primary" />
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              Remove speech bubbles &amp; SFX text {!canRemoveText && <PlanLock feature="removeText" />}
            </p>
            <p className="text-xs text-muted-foreground">
              AI inpainting cleans dialogue balloons and sound effects before animating
            </p>
          </div>
        </div>
        <Switch
          checked={value.removeText}
          disabled={!canRemoveText}
          onCheckedChange={(v) => update("removeText", v)}
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
