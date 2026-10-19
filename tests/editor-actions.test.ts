import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, createFakeDb, writes, type FakeDb } from "./helpers/fake-postgrest";

// ---- module mocks (hoisted above the imports below) -----------------------
const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  client: null as unknown,
  triggerError: null as Error | null,
  triggered: [] as [string, unknown][],
  triggerOptions: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => h.client,
  createClient: async () => h.client,
}));
vi.mock("@/lib/supabase/queries", () => ({
  requireCurrentUser: async () => ({ authUserId: "u1", email: "u1@test.dev", profile: h.db.tables.users[0] }),
  getGenerationById: async () => null,
}));
vi.mock("@/lib/rate-limit", () => ({
  RateLimitError: class RateLimitError extends Error {},
  enforceRateLimit: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/signed-url", () => ({
  MANGA_SOURCES_BUCKET: "manga-sources",
  RENDERED_VIDEOS_BUCKET: "rendered-videos",
  resolveMediaUrl: async (_bucket: string, value: string | null) => value,
  uploadBufferToStorage: async (_bucket: string, path: string) => path,
}));
vi.mock("@/lib/ai", () => ({
  getDefaultProvider: () => "fal",
  getVideoGenerationStatus: async () => ({ status: "processing" }),
}));

function fakeTask(id: string) {
  return {
    trigger: async (payload: unknown, options?: unknown) => {
      h.triggered.push([id, payload]);
      h.triggerOptions.push(options);
      if (h.triggerError) throw h.triggerError;
      return { id: "run_1" };
    },
  };
}
vi.mock("@/trigger/generate-video", () => ({ generateVideoTask: fakeTask("generate-video") }));
vi.mock("@/trigger/post-process-generation", () => ({ postProcessGenerationTask: fakeTask("post-process-generation") }));
vi.mock("@/trigger/upscale-generation", () => ({ upscaleGenerationTask: fakeTask("upscale-generation") }));
vi.mock("@/trigger/generate-audio", () => ({ generateAudioTask: fakeTask("generate-audio") }));
vi.mock("@/trigger/extract-panels", () => ({ extractPanelsTask: fakeTask("extract-panels") }));
vi.mock("@/trigger/export-ratio", () => ({ exportRatioTask: fakeTask("export-ratio") }));
vi.mock("@/trigger/batch-generate", () => ({ batchGenerateTask: fakeTask("batch-generate") }));

import * as actions from "@/app/(dashboard)/editor/[id]/actions";
import { failExport, failEnhancement, refundOptionSurcharge } from "@/lib/generation/pipeline";
import {
  calculateAudioCreditsCost,
  calculateCreditsCost,
  calculateExportRatioCreditsCost,
  calculatePanelExtractionCreditsCost,
  calculateUpscaleCreditsCost,
} from "@/lib/stripe/credits";
import type { AnimationSettingsValue } from "@/components/animation-settings";

// ---- fixtures ---------------------------------------------------------------
const SETTINGS: AnimationSettingsValue = {
  prompt: "",
  cameraMovement: "zoom_in",
  motionIntensity: 0.5,
  fps: 24,
  resolution: "1080p",
  colorize: false,
  removeText: false,
  durationSeconds: 6,
};
const RENDER_COST = calculateCreditsCost({ durationSeconds: 6, resolution: "1080p", colorize: false, removeText: false });
const UPSCALE_COST = calculateUpscaleCreditsCost(4);
const AUDIO_COST = calculateAudioCreditsCost(4);
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

function seed({ balance = 50, plan = "studio", generation = {} as Record<string, unknown> } = {}) {
  h.db = createFakeDb();
  h.client = createFakeClient(h.db);
  h.triggerError = null;
  h.triggered = [];
  h.triggerOptions = [];
  h.db.tables = {
    users: [{ id: "u1", plan, credits_balance: balance }],
    projects: [
      { id: "p1", user_id: "u1", status: "draft" },
      { id: "p-other", user_id: "u2", status: "draft" },
    ],
    generations: [
      {
        id: "g1",
        user_id: "u1",
        project_id: "p1",
        status: "completed",
        progress: 100,
        duration_seconds: 4,
        credits_cost: RENDER_COST,
        output_video_url: "u1/p1/g1.mp4",
        upscale_status: null,
        upscale_requested_at: null,
        audio_status: null,
        audio_requested_at: null,
        ...generation,
      },
    ],
    credit_transactions: [],
    generation_exports: [],
    panel_extractions: [],
  };
}
const balance = () => (h.db.tables.users[0] as { credits_balance: number }).credits_balance;
const gen = (id = "g1") => h.db.tables.generations.find((g) => g.id === id)!;
const ledger = () => h.db.tables.credit_transactions.map((t) => [t.type, t.amount]);

beforeEach(() => seed());

// ---- renders ----------------------------------------------------------------
describe("startGeneration", () => {
  const start = (over: Partial<{ projectId: string; sourceImagePath: string }> = {}) =>
    actions.startGeneration({ projectId: "p1", sourceImagePath: "u1/p1/panel.png", settings: SETTINGS, ...over });

  it("debits, creates the row and queues the render", async () => {
    const r = await start();
    expect(r.error).toBeUndefined();
    expect(balance()).toBe(50 - RENDER_COST);
    expect(h.triggered).toEqual([["generate-video", { generationId: r.data!.id }]]);
    expect(h.db.tables.projects[0].status).toBe("processing");
  });

  it("refunds and fails the row when the render can't be queued", async () => {
    h.triggerError = new Error("TRIGGER_SECRET_KEY is not set");
    const r = await start();
    expect(r.error).toBe("Could not start the render. Your credits were refunded.");
    expect(balance()).toBe(50);
    const row = h.db.tables.generations.find((g) => g.id !== "g1")!;
    expect(row.status).toBe("failed");
    expect(ledger()).toEqual([["generation_debit", -RENDER_COST], ["refund", RENDER_COST]]);
    expect(h.db.tables.projects[0].status).toBe("draft");
  });

  it("refuses someone else's project before charging", async () => {
    const r = await start({ projectId: "p-other" });
    expect(r.error).toBe("Project not found.");
    expect(balance()).toBe(50);
    expect(writes(h.db)).toEqual([]);
  });

  it("refuses a source image outside the user's folder", async () => {
    for (const sourceImagePath of ["u2/p1/panel.png", "https://cdn.example/x.png", "u1/../u2/x.png"]) {
      const r = await start({ sourceImagePath });
      expect(r.error).toMatch(/can't be used/);
    }
    expect(h.db.log).toEqual([]);
  });

  it("prices the normalized settings, not what the browser claims", async () => {
    const r = await actions.startGeneration({
      projectId: "p1",
      sourceImagePath: "u1/p1/panel.png",
      settings: { ...SETTINGS, durationSeconds: 0.1, fps: 1000 },
    });
    expect(r.data?.credits_cost).toBe(RENDER_COST);
    expect([r.data?.duration_seconds, r.data?.fps]).toEqual([6, 50]);
    expect(balance()).toBe(50 - RENDER_COST);
  });

  it("reports missing credits without creating anything", async () => {
    seed({ balance: 1 });
    const r = await start();
    expect(r.error).toBe(`Not enough credits. This render needs ${RENDER_COST}, you have 1.`);
    expect(h.db.tables.generations).toHaveLength(1);
  });
});

describe("startBatchGeneration", () => {
  const batch = (paths = ["u1/p1/a.png", "u1/p1/b.png"], projectId = "p1") =>
    actions.startBatchGeneration({ projectId, sourceImagePaths: paths, settings: SETTINGS });
  beforeEach(() => seed({ plan: "pro" }));

  it("is a Pro feature", async () => {
    seed({ plan: "studio" });
    expect((await batch()).error).toMatch(/Batch rendering is available on the Pro Studio plan/);
    expect(h.triggered).toEqual([]);
  });

  it("queues with the plan's priority", async () => {
    expect((await batch()).error).toBeUndefined();
    expect(h.triggered[0][1]).toMatchObject({ priority: 300, settings: { durationSeconds: 6 } });
  });

  it("reports a queueing failure instead of throwing (nothing was charged)", async () => {
    h.triggerError = new Error("down");
    expect(await batch()).toEqual({ error: "Could not start the batch render. No credits were used." });
    expect(balance()).toBe(50);
  });

  it("refuses foreign panels and projects", async () => {
    expect((await batch(["u1/p1/a.png", "u2/p9/b.png"])).error).toMatch(/can't be used/);
    expect((await batch(undefined, "p-other")).error).toBe("Project not found.");
    expect(h.triggered).toEqual([]);
  });
});

describe("plan features", () => {
  const start = (settings: Partial<AnimationSettingsValue>) =>
    actions.startGeneration({ projectId: "p1", sourceImagePath: "u1/p1/panel.png", settings: { ...SETTINGS, ...settings } });

  it("keeps 4K, colorize and text removal for Studio and up", async () => {
    for (const plan of ["free", "starter"]) {
      seed({ plan });
      expect((await start({ resolution: "4k" })).error).toMatch(/4K renders is available on the Studio plan/);
      expect((await start({ colorize: true })).error).toMatch(/AI colorization/);
      expect((await start({ removeText: true })).error).toMatch(/Text & bubble removal/);
      expect((await actions.requestUpscale("g1")).error).toMatch(/4K upscaling/);
      expect(balance()).toBe(50);
    }
    seed({ plan: "studio" });
    expect((await start({ resolution: "4k", colorize: true, removeText: true })).error).toBeUndefined();
  });

  it("lets every plan render 1080p and add sound", async () => {
    seed({ plan: "free" });
    expect((await start({})).error).toBeUndefined();
    expect((await actions.requestAudio("g1")).error).toBeUndefined();
  });

  it("gives paid plans a queue head start", async () => {
    seed({ plan: "free" });
    await start({});
    seed({ plan: "studio" });
    await start({});
    expect(h.triggerOptions).toEqual([{ priority: 60 }]);
  });
});

// ---- exports / panel splits ---------------------------------------------------
describe("requestExportRatio", () => {
  it("returns the post-debit balance and passes the cost to the task", async () => {
    const r = await actions.requestExportRatio("g1", "9:16");
    const cost = calculateExportRatioCreditsCost();
    expect(r.data).toEqual({ queued: true, creditsBalance: 50 - cost });
    expect(h.triggered[0]).toEqual(["export-ratio", { generationExportId: expect.any(String), creditsCost: cost }]);
  });

  it("refunds and fails the export when it can't be queued", async () => {
    h.triggerError = new Error("down");
    const r = await actions.requestExportRatio("g1", "9:16");
    expect(r.error).toBe("Could not start the export. Your credits were refunded.");
    expect(balance()).toBe(50);
    expect(h.db.tables.generation_exports[0].status).toBe("failed");
  });

  it("failExport refunds only once, however often it runs", async () => {
    h.db.tables.generation_exports.push({ id: "e1", user_id: "u1", generation_id: "g1", status: "processing" });
    await failExport(h.client as never, { exportId: "e1", creditsCost: 3, message: "boom" });
    await failExport(h.client as never, { exportId: "e1", creditsCost: 3, message: "boom again" });
    expect(balance()).toBe(53);
    expect(ledger()).toEqual([["refund", 3]]);
  });
});

describe("requestPanelExtraction", () => {
  it("refuses someone else's project or page", async () => {
    expect((await actions.requestPanelExtraction("p-other", "u1/p1/page.png")).error).toBe("Project not found.");
    expect((await actions.requestPanelExtraction("p1", "u2/p1/page.png")).error).toMatch(/can't be used/);
    expect(balance()).toBe(50);
  });

  it("returns the post-debit balance", async () => {
    const r = await actions.requestPanelExtraction("p1", "u1/p1/page.png");
    expect(r.data?.creditsBalance).toBe(50 - calculatePanelExtractionCreditsCost());
  });

  it("refunds when the split can't be queued", async () => {
    h.triggerError = new Error("down");
    const r = await actions.requestPanelExtraction("p1", "u1/p1/page.png");
    expect(r.error).toBe("Could not start splitting this page. Your credits were refunded.");
    expect(balance()).toBe(50);
    expect(h.db.tables.panel_extractions[0].status).toBe("failed");
  });
});

// ---- 4K upscale / AI sound ----------------------------------------------------
describe("requestUpscale / requestAudio", () => {
  it("claims the job, then debits, then queues", async () => {
    const r = await actions.requestUpscale("g1");
    expect(r.data).toEqual({ queued: true, creditsBalance: 50 - UPSCALE_COST });
    expect(gen().upscale_status).toBe("processing");
    expect(writes(h.db)).toEqual(["PATCH generations", "POST rpc/deduct_user_credits", "POST credit_transactions"]);
    expect(h.triggered).toEqual([["upscale-generation", { generationId: "g1", creditsCost: UPSCALE_COST }]]);
  });

  it("refuses a double click without charging twice", async () => {
    await actions.requestUpscale("g1");
    const second = await actions.requestUpscale("g1");
    expect(second.error).toBe("A 4K upscale is already running for this render.");
    expect(balance()).toBe(50 - UPSCALE_COST);
    expect(h.triggered).toHaveLength(1);
  });

  it("releases the claim when credits are short", async () => {
    seed({ balance: 2, generation: { upscale_status: "failed", upscale_requested_at: "2026-10-01T10:00:00.000Z" } });
    const r = await actions.requestUpscale("g1");
    expect(r.error).toBe(`Not enough credits. Upscaling needs ${UPSCALE_COST}.`);
    expect([gen().upscale_status, gen().upscale_requested_at]).toEqual(["failed", "2026-10-01T10:00:00.000Z"]);
  });

  it("refunds and flags failed when the job can't be queued", async () => {
    h.triggerError = new Error("down");
    const r = await actions.requestUpscale("g1");
    expect(r.error).toBe("Could not start the 4K upscale. Your credits were refunded.");
    expect(balance()).toBe(50);
    expect(gen().upscale_status).toBe("failed");
    expect(writes(h.db).slice(3)).toEqual(["POST rpc/add_user_credits", "POST credit_transactions", "PATCH generations"]);
  });

  it("lets a job lost for over an hour be requested again", async () => {
    seed({ generation: { upscale_status: "processing", upscale_requested_at: iso(2 * 3_600_000) } });
    expect((await actions.requestUpscale("g1")).data?.queued).toBe(true);
    seed({ generation: { upscale_status: "processing", upscale_requested_at: iso(30 * 60_000) } });
    expect((await actions.requestUpscale("g1")).error).toMatch(/already running/);
  });

  it("runs sound independently of a running upscale", async () => {
    seed({ generation: { upscale_status: "processing", upscale_requested_at: iso(60_000) } });
    const r = await actions.requestAudio("g1");
    expect(r.data?.creditsBalance).toBe(50 - AUDIO_COST);
    expect([gen().audio_status, gen().upscale_status]).toEqual(["processing", "processing"]);
  });

  it("failEnhancement refunds before flagging failed", async () => {
    await failEnhancement(h.client as never, {
      generationId: "g1",
      userId: "u1",
      kind: "audio",
      creditsCost: AUDIO_COST,
      description: "Refund for failed audio generation",
    });
    expect(balance()).toBe(50 + AUDIO_COST);
    expect(writes(h.db)).toEqual(["POST rpc/add_user_credits", "POST credit_transactions", "PATCH generations"]);
  });
});

// ---- optional pre-processing steps --------------------------------------------
describe("refundOptionSurcharge", () => {
  const generation = (over: Record<string, unknown>) => ({
    id: "g1",
    user_id: "u1",
    duration_seconds: 6,
    resolution: "1080p" as const,
    colorize: true,
    remove_text: true,
    credits_cost: calculateCreditsCost({ durationSeconds: 6, resolution: "1080p", colorize: true, removeText: true }),
    ...over,
  });

  it("refunds exactly what the failed option added and lowers credits_cost", async () => {
    const g = generation({});
    const withoutColor = calculateCreditsCost({ durationSeconds: 6, resolution: "1080p", colorize: false, removeText: true });
    const left = await refundOptionSurcharge(h.client as never, g, "colorize");
    expect(left).toEqual({ credits_cost: withoutColor, colorize: false, remove_text: true });
    expect(balance()).toBe(50 + (g.credits_cost - withoutColor));
    expect(gen().credits_cost).toBe(withoutColor);
  });

  it("stacks correctly when both options fail", async () => {
    const g = generation({});
    Object.assign(g, await refundOptionSurcharge(h.client as never, g, "removeText"));
    Object.assign(g, await refundOptionSurcharge(h.client as never, g, "colorize"));
    const plain = calculateCreditsCost({ durationSeconds: 6, resolution: "1080p", colorize: false, removeText: false });
    expect(g.credits_cost).toBe(plain);
    expect(balance()).toBe(50 + generation({}).credits_cost - plain);
  });
});
