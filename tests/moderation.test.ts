import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ score: 0 as number | undefined, calls: [] as [string, unknown][] }));
vi.mock("@fal-ai/client", () => ({
  fal: {
    config: () => {},
    run: async (endpoint: string, { input }: { input: unknown }) => {
      h.calls.push([endpoint, input]);
      return { data: { nsfw_probability: h.score } };
    },
  },
}));

import { assertImageAllowed, ContentRejectedError, NSFW_THRESHOLD } from "@/lib/ai/moderation";

describe("assertImageAllowed", () => {
  it("lets ordinary panels through", async () => {
    h.score = 0.1;
    await expect(assertImageAllowed("https://signed.example/p.png")).resolves.toBeUndefined();
    expect(h.calls.at(-1)).toEqual(["fal-ai/imageutils/nsfw", { image_url: "https://signed.example/p.png" }]);
  });

  it("refuses images at or above the threshold", async () => {
    h.score = NSFW_THRESHOLD;
    await expect(assertImageAllowed("https://signed.example/x.png")).rejects.toBeInstanceOf(ContentRejectedError);
  });

  it("fails closed when the check returns nothing usable", async () => {
    h.score = undefined;
    const err = await assertImageAllowed("https://signed.example/y.png").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ContentRejectedError);
  });
});
