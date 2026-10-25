import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, createFakeDb, type FakeDb } from "./helpers/fake-postgrest";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  client: null as unknown,
  triggerError: null as Error | null,
  triggered: [] as unknown[],
  deleted: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => h.client }));
vi.mock("@/lib/supabase/queries", () => ({
  requireCurrentUser: async () => ({ authUserId: "u1", email: "u1@test.dev", profile: h.db.tables.users[0] }),
  resolveEpisodeMedia: async (e: unknown) => e,
}));
vi.mock("@/lib/rate-limit", () => ({ RateLimitError: class extends Error {}, enforceRateLimit: async () => {} }));
vi.mock("@/lib/supabase/signed-url", () => ({
  RENDERED_VIDEOS_BUCKET: "rendered-videos",
  deleteFromStorage: async (_b: string, paths: string[]) => {
    h.deleted.push(...paths);
  },
}));
vi.mock("@/trigger/assemble-episode", () => ({
  assembleEpisodeTask: {
    trigger: async (payload: unknown) => {
      h.triggered.push(payload);
      if (h.triggerError) throw h.triggerError;
    },
  },
}));

import { createEpisode, deleteEpisode, getEpisode } from "@/app/(dashboard)/editor/[id]/episode-actions";
import { MAX_EPISODE_CAPTION, MAX_EPISODE_CLIPS, validateEpisodeRequest } from "@/lib/generation/episodes";

const gen = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  user_id: "u1",
  project_id: "p1",
  status: "completed",
  progress: 100,
  ...over,
});

beforeEach(() => {
  h.db = createFakeDb();
  h.client = createFakeClient(h.db);
  h.triggerError = null;
  h.triggered = [];
  h.deleted = [];
  h.db.tables = {
    users: [{ id: "u1", plan: "free" }],
    projects: [
      { id: "p1", user_id: "u1" },
      { id: "p2", user_id: "u2" },
    ],
    generations: [
      gen("g1"),
      gen("g2"),
      gen("g-finalizing", { progress: 70 }),
      gen("g-other-project", { project_id: "p9" }),
      gen("g-other-user", { user_id: "u2" }),
    ],
    episodes: [],
  };
});

const request = (clips: { generationId: string; caption?: string }[], over = {}) => ({
  title: "  Chapter 1  ",
  aspectRatio: "9:16",
  transition: "fade",
  clips,
  ...over,
});

describe("validateEpisodeRequest", () => {
  it("trims and bounds what the browser sends", () => {
    const r = validateEpisodeRequest(request([{ generationId: "g1", caption: " " + "x".repeat(MAX_EPISODE_CAPTION + 10) }, { generationId: "g2", caption: "   " }]));
    expect("data" in r && r.data).toMatchObject({
      title: "Chapter 1",
      aspect_ratio: "9:16",
      transition: "fade",
      clips: [{ generation_id: "g1", caption: "x".repeat(MAX_EPISODE_CAPTION) }, { generation_id: "g2", caption: null }],
    });
  });

  it("rejects empty, oversized or unknown requests", () => {
    expect(validateEpisodeRequest(request([]))).toEqual({ error: "Pick at least one finished render." });
    const many = Array.from({ length: MAX_EPISODE_CLIPS + 1 }, (_, i) => ({ generationId: `g${i}` }));
    expect("error" in validateEpisodeRequest(request(many))).toBe(true);
    expect(validateEpisodeRequest(request([{ generationId: "g1" }], { aspectRatio: "4:3" }))).toEqual({ error: "Unknown format." });
    expect(validateEpisodeRequest(request([{ generationId: "g1" }], { transition: "wipe" }))).toEqual({ error: "Unknown transition." });
  });
});

describe("createEpisode", () => {
  it("queues an episode from finished renders, in the chosen order", async () => {
    const r = await createEpisode("p1", request([{ generationId: "g2", caption: "Hi" }, { generationId: "g1" }]));
    expect(r.error).toBeUndefined();
    expect(r.data).toMatchObject({ status: "pending", title: "Chapter 1", clips: [{ generation_id: "g2", caption: "Hi" }, { generation_id: "g1", caption: null }] });
    expect(h.triggered).toEqual([{ episodeId: r.data!.id }]);
  });

  it("refuses renders that aren't finished, from another project, or someone else's", async () => {
    for (const id of ["g-finalizing", "g-other-project", "g-other-user", "missing"]) {
      const r = await createEpisode("p1", request([{ generationId: "g1" }, { generationId: id }]));
      expect(r.error).toMatch(/aren't finished/);
    }
    expect(h.db.tables.episodes).toHaveLength(0);
  });

  it("refuses someone else's project", async () => {
    expect((await createEpisode("p2", request([{ generationId: "g1" }]))).error).toBe("Project not found.");
  });

  it("marks the episode failed when it can't be queued", async () => {
    h.triggerError = new Error("down");
    const r = await createEpisode("p1", request([{ generationId: "g1" }]));
    expect(r.error).toMatch(/Could not start/);
    expect(h.db.tables.episodes[0].status).toBe("failed");
  });
});

describe("getEpisode / deleteEpisode", () => {
  beforeEach(() => {
    h.db.tables.episodes = [
      { id: "e1", user_id: "u1", project_id: "p1", status: "completed", clips: [], output_video_url: "u1/p1/episode-e1.mp4", thumbnail_url: "u1/p1/episode-e1-thumb.jpg" },
      { id: "e2", user_id: "u2", project_id: "p2", status: "completed", clips: [], output_video_url: "u2/p2/episode-e2.mp4", thumbnail_url: null },
    ];
  });

  it("only returns the user's own episodes", async () => {
    expect((await getEpisode("e1"))?.id).toBe("e1");
    expect(await getEpisode("e2")).toBeNull();
  });

  it("deletes the row and its files, and nobody else's", async () => {
    expect(await deleteEpisode("e2")).toEqual({ error: "Episode not found." });
    expect(await deleteEpisode("e1")).toEqual({ data: { deleted: true } });
    expect(h.deleted).toEqual(["u1/p1/episode-e1.mp4", "u1/p1/episode-e1-thumb.jpg"]);
    expect(h.db.tables.episodes.map((e) => e.id)).toEqual(["e2"]);
  });
});
