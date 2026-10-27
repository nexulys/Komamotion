"use client";

import { Loader2, Sparkles } from "lucide-react";
import { AnimationSettings, type AnimationSettingsValue } from "@/components/animation-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlanId } from "@/lib/supabase/types";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VIDEO_MODELS, type VideoModelId } from "@/lib/ai/video-models";

/** Right-hand column: animation settings plus the single-panel generate button (hidden in batch mode). */
export function SettingsPanel({
  settings,
  onSettingsChange,
  batchMode,
  hasSelectedPanel,
  isSubmitting,
  onGenerate,
  plan,
  modelPicker,
}: {
  settings: AnimationSettingsValue;
  onSettingsChange: (settings: AnimationSettingsValue) => void;
  batchMode: boolean;
  hasSelectedPanel: boolean;
  isSubmitting: boolean;
  onGenerate: () => void;
  plan: PlanId;
  /** Admins only: which video model to render with, for quality comparisons. */
  modelPicker?: { value: VideoModelId; onChange: (model: VideoModelId) => void };
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Animation settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {modelPicker && (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <Label>Video model · admin test</Label>
              <Select value={modelPicker.value} onValueChange={(v) => modelPicker.onChange(v as VideoModelId)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(VIDEO_MODELS).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{VIDEO_MODELS[modelPicker.value].note}. Customers always get the default.</p>
            </div>
          )}
          <AnimationSettings value={settings} onChange={onSettingsChange} disabled={isSubmitting} plan={plan} />
        </CardContent>
      </Card>

      {!batchMode && (
        <Button
          size="lg"
          variant="brand"
          className="w-full"
          disabled={!hasSelectedPanel || isSubmitting}
          onClick={onGenerate}
        >
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Generate animation
        </Button>
      )}
    </>
  );
}
