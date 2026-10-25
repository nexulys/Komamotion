/**
 * Runs the real ffmpeg pipeline on generated test clips. Skipped where
 * ffmpeg isn't installed (Trigger.dev's deploy image has it).
 */
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyWatermark, cropToRatio, extractThumbnail } from "@/lib/media/ffmpeg";
import { assembleEpisode, CROSSFADE_SECONDS, TITLE_CARD_SECONDS, wrapText } from "@/lib/media/episode";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const dir = mkdtempSync(join(tmpdir(), "komamotion-media-"));
let server: Server;
let base = "";

export function makeClip(name: string, size: string, seconds = 2, withAudio = true) {
  const out = join(dir, name);
  const args = ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=24:duration=${seconds}`];
  if (withAudio) args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-shortest", "-c:a", "aac");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", out);
  execFileSync("ffmpeg", args);
  return out;
}

export function probe(file: string): { codec_type: string; width?: number; height?: number }[] {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", file]).toString()).streams;
}

export const mediaUrl = (name: string) => `${base}/${name}`;

describe.skipIf(!hasFfmpeg)("media pipeline (real ffmpeg)", () => {
  beforeAll(async () => {
    makeClip("hd.mp4", "1920x1080");
    makeClip("small.mp4", "640x360");
    makeClip("vertical-silent.mp4", "1080x1920", 2, false);
    server = createServer((req, res) => res.end(readFileSync(join(dir, req.url!.slice(1)))));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => {
    server?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("free pass: caps 1080p at 720p, keeps audio, accepts the site-address label", async () => {
    const out = join(dir, "wm.mp4");
    writeFileSync(out, await applyWatermark(mediaUrl("hd.mp4"), "Made with KomaMotion · komamotion.vercel.app"));
    const streams = probe(out);
    expect(streams.find((s) => s.codec_type === "video")).toMatchObject({ width: 1280, height: 720 });
    expect(streams.some((s) => s.codec_type === "audio")).toBe(true);
  }, 60_000);

  it("free pass never upscales", async () => {
    const out = join(dir, "wm-small.mp4");
    writeFileSync(out, await applyWatermark(mediaUrl("small.mp4")));
    expect(probe(out).find((s) => s.codec_type === "video")).toMatchObject({ width: 640, height: 360 });
  }, 60_000);

  it("9:16 export crop", async () => {
    const out = join(dir, "crop.mp4");
    writeFileSync(out, await cropToRatio(mediaUrl("hd.mp4"), "9:16"));
    const v = probe(out).find((s) => s.codec_type === "video")!;
    expect(Math.abs(v.width! / v.height! - 9 / 16)).toBeLessThan(0.01);
  }, 60_000);

  it("thumbnail from a URL or from bytes: a 640px-wide JPEG", async () => {
    for (const source of [mediaUrl("hd.mp4"), readFileSync(join(dir, "small.mp4"))]) {
      const jpg = await extractThumbnail(source);
      expect(jpg.subarray(0, 2).toString("hex")).toBe("ffd8");
      const file = join(dir, `thumb-${Date.now()}.jpg`);
      writeFileSync(file, jpg);
      expect(probe(file)[0]).toMatchObject({ width: 640 });
    }
  }, 60_000);

  const durationOf = (file: string) =>
    Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());

  it("episode, vertical with crossfades: title card, mixed sizes, a silent clip and captions", async () => {
    const { video, durationSeconds } = await assembleEpisode({
      ratio: "9:16",
      transition: "fade",
      title: "Chapter 1 — The Duel",
      clips: [
        { url: mediaUrl("hd.mp4"), caption: "The wind rises over the old dojo, and Ren finally draws his blade" },
        { url: mediaUrl("vertical-silent.mp4"), caption: null },
        { url: mediaUrl("small.mp4"), caption: "« Ce n'est que le début. »" },
      ],
    });
    const file = join(dir, "episode-fade.mp4");
    writeFileSync(file, video);
    const streams = probe(file);
    expect(streams.find((s) => s.codec_type === "video")).toMatchObject({ width: 1080, height: 1920 });
    expect(streams.some((s) => s.codec_type === "audio")).toBe(true);
    const expected = TITLE_CARD_SECONDS + 3 * 2 - 3 * CROSSFADE_SECONDS;
    expect(Math.abs(durationSeconds - expected)).toBeLessThan(0.3);
  }, 180_000);

  it("episode, horizontal with hard cuts and no title", async () => {
    const { video, durationSeconds } = await assembleEpisode({
      ratio: "16:9",
      transition: "cut",
      clips: [{ url: mediaUrl("vertical-silent.mp4") }, { url: mediaUrl("hd.mp4") }],
    });
    const file = join(dir, "episode-cut.mp4");
    writeFileSync(file, video);
    expect(probe(file).find((s) => s.codec_type === "video")).toMatchObject({ width: 1920, height: 1080 });
    expect(Math.abs(durationSeconds - 4)).toBeLessThan(0.3);
    expect(Math.abs(durationOf(file) - durationSeconds)).toBeLessThan(0.01);
  }, 180_000);

  it("a single clip still makes an episode", async () => {
    const { durationSeconds } = await assembleEpisode({ ratio: "1:1", transition: "fade", clips: [{ url: mediaUrl("small.mp4") }] });
    expect(Math.abs(durationSeconds - 2)).toBeLessThan(0.3);
  }, 120_000);
});

describe("wrapText", () => {
  it("wraps on words without exceeding the width", () => {
    expect(wrapText("The wind rises over the old dojo", 12)).toBe("The wind\nrises over\nthe old dojo");
    expect(wrapText("short", 12)).toBe("short");
  });
});
