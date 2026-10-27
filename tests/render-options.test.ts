import { describe, expect, it } from "vitest";
import { normalizeRenderSettings, MAX_PROMPT_LENGTH, type RenderSettings } from "@/lib/ai/render-options";

const base: RenderSettings = {
  prompt: "wind",
  cameraMovement: "pan_left",
  motionIntensity: 0.4,
  fps: 24,
  resolution: "4k",
  colorize: true,
  removeText: false,
  durationSeconds: 8,
};

describe("normalizeRenderSettings", () => {
  it("keeps values the model accepts", () => {
    expect(normalizeRenderSettings(base)).toEqual(base);
  });

  it("snaps duration and fps onto the model's options", () => {
    const n = normalizeRenderSettings({ ...base, durationSeconds: 0.1, fps: 60 });
    expect([n.durationSeconds, n.fps]).toEqual([6, 50]);
    expect(normalizeRenderSettings({ ...base, durationSeconds: 9.2 }).durationSeconds).toBe(10);
    expect(normalizeRenderSettings({ ...base, durationSeconds: Number.NaN }).durationSeconds).toBe(6);
  });

  it("rejects anything outside the allowed sets", () => {
    const n = normalizeRenderSettings({
      ...base,
      resolution: "8k" as never,
      cameraMovement: "barrel_roll" as never,
      motionIntensity: 7,
      colorize: "yes" as never,
      prompt: "x".repeat(MAX_PROMPT_LENGTH + 50),
    });
    expect(n.resolution).toBe("1080p");
    expect(n.cameraMovement).toBe("zoom_in");
    expect(n.motionIntensity).toBe(1);
    expect(n.colorize).toBe(false);
    expect(n.prompt).toHaveLength(MAX_PROMPT_LENGTH);
  });
});
