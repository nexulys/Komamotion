/**
 * Runs the real ffmpeg pipeline on generated test clips. Skipped where
 * ffmpeg isn't installed (Trigger.dev's deploy image has it).
 */
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyWatermark, cropToRatio, extractThumbnail } from "@/lib/media/ffmpeg";

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
    server = createServer((req, res) => res.end(readFileSync(join(dir, req.url!.slice(1)))));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => server?.close());

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
});
