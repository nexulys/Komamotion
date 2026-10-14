"use client";

import { Loader2, Sparkles } from "lucide-react";
import { AnimationSettings, type AnimationSettingsValue } from "@/components/animation-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Right-hand column: animation settings plus the single-panel generate button (hidden in batch mode). */
export function SettingsPanel({
  settings,
  onSettingsChange,
  batchMode,
  hasSelectedPanel,
  isSubmitting,
  onGenerate,
}: {
  settings: AnimationSettingsValue;
  onSettingsChange: (settings: AnimationSettingsValue) => void;
  batchMode: boolean;
  hasSelectedPanel: boolean;
  isSubmitting: boolean;
  onGenerate: () => void;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Animation settings</CardTitle>
        </CardHeader>
        <CardContent>
          <AnimationSettings value={settings} onChange={onSettingsChange} disabled={isSubmitting} />
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
