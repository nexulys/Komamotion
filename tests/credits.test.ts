import { describe, expect, it } from "vitest";
import { calculateCreditsCost, formatVideoDuration, seconds1080pFor } from "@/lib/stripe/credits";
import { ALL_PLANS, FREE_PLAN } from "@/lib/stripe/plans";
import { PROVIDER_COST_PER_SECOND } from "@/lib/ai/costs";

const render = (durationSeconds: number, resolution: "1080p" | "4k", colorize = false, removeText = false) =>
  calculateCreditsCost({ durationSeconds, resolution, colorize, removeText });

describe("render pricing", () => {
  it("charges 3 credits per second in 1080p and 12 in 4K", () => {
    expect(render(6, "1080p")).toBe(18);
    expect(render(10, "1080p")).toBe(30);
    expect(render(6, "4k")).toBe(72);
  });

  it("adds 25% for colorization and a flat 3 for text removal", () => {
    expect(render(6, "1080p", true)).toBe(23); // 22.5 rounded up
    expect(render(6, "1080p", false, true)).toBe(21);
  });

  it("lets a new free account make one 6-second video", () => {
    expect(FREE_PLAN.credits).toBeGreaterThanOrEqual(render(6, "1080p"));
    expect(FREE_PLAN.credits).toBeLessThan(render(6, "1080p") * 2);
  });

  it("sells every paid second above its fal cost, in 1080p and 4K", () => {
    for (const plan of ALL_PLANS.filter((p) => p.price > 0)) {
      const perCredit = plan.price / plan.credits;
      expect(perCredit * render(1, "1080p")).toBeGreaterThan(PROVIDER_COST_PER_SECOND.fal["1080p"] * 1.5);
      expect(perCredit * render(1, "4k")).toBeGreaterThan(PROVIDER_COST_PER_SECOND.fal["4k"] * 1.5);
    }
  });
});

describe("pricing copy helpers", () => {
  it("turns credits into seconds of 1080p video", () => {
    expect(seconds1080pFor(600)).toBe(200);
    expect(formatVideoDuration(200)).toBe("3 min 20 s");
    expect(formatVideoDuration(6)).toBe("6 s");
    expect(formatVideoDuration(120)).toBe("2 min");
  });
});
