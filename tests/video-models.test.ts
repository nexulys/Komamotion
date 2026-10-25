import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ submitted: [] as [string, Record<string, unknown>][], statusEndpoint: "" }));
vi.mock("@fal-ai/client", () => ({
  fal: {
    config: () => {},
    queue: {
      submit: async (endpoint: string, { input }: { input: Record<string, unknown> }) => {
        h.submitted.push([endpoint, input]);
        return { request_id: "req_1" };
      },
      status: async (endpoint: string) => {
        h.statusEndpoint = endpoint;
        return { status: "COMPLETED" };
      },
      result: async () => ({ data: { video: { url: "https://fal.media/out.mp4" } } }),
    },
  },
}));

import { falConnector } from "@/lib/ai/fal";
import { DEFAULT_VIDEO_MODEL, VIDEO_MODELS, resolveVideoModel } from "@/lib/ai/video-models";

const params = {
  imageUrl: "https://signed.example/panel.png",
  prompt: "wind",
  cameraMovement: "zoom_in" as const,
  motionIntensity: 0.5,
  fps: 24,
  resolution: "1080p" as const,
  durationSeconds: 8,
  colorize: false,
  webhookUrl: "https://app.example/api/webhooks/ai?token=t",
};

beforeEach(() => {
  h.submitted = [];
});

describe("video model registry", () => {
  it("treats legacy or unknown values as the default model", () => {
    expect(resolveVideoModel("ltx-video").id).toBe(DEFAULT_VIDEO_MODEL);
    expect(resolveVideoModel(null).id).toBe(DEFAULT_VIDEO_MODEL);
    expect(resolveVideoModel("hailuo-02").endpoint).toBe(VIDEO_MODELS["hailuo-02"].endpoint);
  });
});

describe("fal connector", () => {
  it("sends LTX-2.3 the exact duration, fps and resolution, silent", async () => {
    await falConnector.submit({ ...params, resolution: "4k", model: null });
    expect(h.submitted[0][0]).toBe("fal-ai/ltx-2.3/image-to-video/fast");
    expect(h.submitted[0][1]).toMatchObject({ duration: "8", fps: "24", resolution: "2160p", generate_audio: false, image_url: params.imageUrl });
  });

  it("maps settings onto what each comparison model accepts", async () => {
    await falConnector.submit({ ...params, model: "kling-2.5-turbo" });
    await falConnector.submit({ ...params, model: "seedance-1-lite" });
    await falConnector.submit({ ...params, model: "hailuo-02", durationSeconds: 6 });
    expect(h.submitted.map(([e, i]) => [e, i.duration, i.resolution])).toEqual([
      ["fal-ai/kling-video/v2.5-turbo/standard/image-to-video", "10", undefined],
      ["fal-ai/bytedance/seedance/v1/lite/image-to-video", "8", "1080p"],
      ["fal-ai/minimax/hailuo-02/standard/image-to-video", "6", "768P"],
    ]);
  });

  it("checks status on the endpoint the render was submitted to", async () => {
    const status = await falConnector.getStatus("req_1", "seedance-1-lite");
    expect(h.statusEndpoint).toBe(VIDEO_MODELS["seedance-1-lite"].endpoint);
    expect(status).toEqual({ status: "completed", videoUrl: "https://fal.media/out.mp4" });
  });
});
