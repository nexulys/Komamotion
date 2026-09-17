import ffmpeg from "fluent-ffmpeg";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExportRatio } from "@/lib/supabase/types";

// The Trigger.dev `ffmpeg()` build extension (see trigger.config.ts) sets
// these env vars automatically in the deployed container. Locally,
// fluent-ffmpeg falls back to whatever `ffmpeg`/`ffprobe` is on PATH.
if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

const RATIO_TO_DECIMAL: Record<ExportRatio, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "komamotion-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function downloadToFile(url: string, destPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  await writeFile(destPath, Buffer.from(await res.arrayBuffer()));
}

function probeDimensions(path: string): Promise<{ width: number; height: number; durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(path, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.codec_type === "video");
      if (!stream?.width || !stream?.height) {
        return reject(new Error("Could not read video dimensions"));
      }
      resolve({
        width: stream.width,
        height: stream.height,
        durationSeconds: data.format.duration ?? 0,
      });
    });
  });
}

function runFfmpeg(build: (cmd: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    build(ffmpeg())
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

/**
 * Burns in a bottom-right "KomaMotion AI Free" watermark for free-tier
 * renders. Runs automatically as a post-processing step (see
 * trigger/post-process.ts) — never applied to paid plans.
 */
export async function applyWatermark(videoUrl: string, label = "KomaMotion AI Free"): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inputPath = join(dir, "input.mp4");
    const outputPath = join(dir, "output.mp4");
    await downloadToFile(videoUrl, inputPath);

    await runFfmpeg(
      (cmd) =>
        cmd
          .input(inputPath)
          .videoFilters([
            {
              filter: "drawtext",
              options: {
                text: label,
                fontcolor: "white@0.85",
                fontsize: 22,
                x: "w-tw-24",
                y: "h-th-24",
                box: 1,
                boxcolor: "black@0.35",
                boxborderw: 8,
              },
            },
          ])
          .outputOptions(["-c:a", "copy"]),
      outputPath
    );

    return readFile(outputPath);
  });
}

/**
 * Center-crops (then scales) a rendered video to a target aspect ratio for
 * multi-channel export: 16:9 (YouTube), 9:16 (TikTok/Reels/Shorts), 1:1
 * (Instagram feed).
 */
export async function cropToRatio(videoUrl: string, ratio: ExportRatio): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inputPath = join(dir, "input.mp4");
    const outputPath = join(dir, "output.mp4");
    await downloadToFile(videoUrl, inputPath);

    const { width, height } = await probeDimensions(inputPath);
    const targetRatio = RATIO_TO_DECIMAL[ratio];
    const currentRatio = width / height;

    let cropWidth = width;
    let cropHeight = height;
    if (currentRatio > targetRatio) {
      cropWidth = Math.round(height * targetRatio);
    } else if (currentRatio < targetRatio) {
      cropHeight = Math.round(width / targetRatio);
    }
    // even dimensions — required by most H.264 encoders
    cropWidth -= cropWidth % 2;
    cropHeight -= cropHeight % 2;

    await runFfmpeg(
      (cmd) =>
        cmd
          .input(inputPath)
          .videoFilters(`crop=${cropWidth}:${cropHeight}`)
          .outputOptions(["-c:a", "copy"]),
      outputPath
    );

    return readFile(outputPath);
  });
}

/** Muxes a generated audio track onto the rendered video, trimmed to its length. */
export async function muxAudio(videoUrl: string, audioBuffer: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const videoPath = join(dir, "input.mp4");
    const audioPath = join(dir, "audio.mp3");
    const outputPath = join(dir, "output.mp4");
    await downloadToFile(videoUrl, videoPath);
    await writeFile(audioPath, audioBuffer);

    await runFfmpeg(
      (cmd) =>
        cmd
          .input(videoPath)
          .input(audioPath)
          .outputOptions(["-c:v", "copy", "-c:a", "aac", "-shortest", "-map", "0:v:0", "-map", "1:a:0"]),
      outputPath
    );

    return readFile(outputPath);
  });
}

export async function probeVideoDuration(videoUrl: string): Promise<number> {
  return withTempDir(async (dir) => {
    const inputPath = join(dir, "input.mp4");
    await downloadToFile(videoUrl, inputPath);
    const { durationSeconds } = await probeDimensions(inputPath);
    return durationSeconds;
  });
}
