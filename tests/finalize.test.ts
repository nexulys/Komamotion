import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, createFakeDb, type FakeDb } from "./helpers/fake-postgrest";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, client: null as unknown, uploads: [] as string[] }));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => h.client,
  createClient: async () => h.client,
}));
vi.mock("@/lib/supabase/signed-url", () => ({
  MANGA_SOURCES_BUCKET: "manga-sources",
  RENDERED_VIDEOS_BUCKET: "rendered-videos",
  resolveMediaUrl: async (_bucket: string, value: string | null) => (value ? `signed:${value}` : null),
  uploadBufferToStorage: async (_bucket: string, path: string) => {
    h.uploads.push(path);
    return path;
  },
}));

import { finalizeGenerationCompleted } from "@/lib/generation/pipeline";
import { getGenerationById } from "@/lib/supabase/queries";

function seed(plan: string, generation: Record<string, unknown> = {}) {
  h.db = createFakeDb();
  h.client = createFakeClient(h.db);
  h.uploads = [];
  h.db.tables = {
    users: [{ id: "u1", plan }],
    projects: [{ id: "p1", user_id: "u1", status: "processing" }],
    generations: [
      { id: "g1", user_id: "u1", project_id: "p1", status: "processing", progress: 50, output_video_url: null, thumbnail_url: null, ...generation },
    ],
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "video/mp4" } }));
});

describe("finalizeGenerationCompleted", () => {
  it("parks a free render where its owner can't read it until it's watermarked", async () => {
    seed("free");
    const { transitioned } = await finalizeGenerationCompleted("g1", { videoUrl: "https://fal.media/v.mp4" });
    expect(transitioned).toBe(true);
    expect(h.uploads).toEqual(["unprocessed/g1.mp4"]);
    expect(h.db.tables.generations[0]).toMatchObject({ status: "completed", progress: 70, output_video_url: "unprocessed/g1.mp4" });
  });

  it("stores a paid render straight in the user's folder", async () => {
    seed("studio");
    await finalizeGenerationCompleted("g1", { videoUrl: "https://fal.media/v.mp4" });
    expect(h.uploads).toEqual(["u1/p1/g1.mp4"]);
  });
});

describe("what the editor receives", () => {
  it("shows a completed-but-unfinalized render as still rendering, without its video", async () => {
    seed("free", { status: "completed", progress: 70, output_video_url: "unprocessed/g1.mp4" });
    const g = await getGenerationById("g1", "u1");
    expect(g).toMatchObject({ status: "processing", progress: 70, output_video_url: null });
  });

  it("shows a finalized render with a signed video URL", async () => {
    seed("free", { status: "completed", progress: 100, output_video_url: "u1/p1/g1-wm.mp4" });
    const g = await getGenerationById("g1", "u1");
    expect(g).toMatchObject({ status: "completed", output_video_url: "signed:u1/p1/g1-wm.mp4" });
  });
});
