import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EpisodeTransition, ExportRatio } from "@/lib/supabase/types";

/**
 * Assembles finished renders into one publish-ready episode with ffmpeg
 * (needs ffmpeg ≥ 6.1 for centered multi-line text; Trigger.dev installs 7):
 * every clip is brought to the target frame (fit inside, over a blurred
 * fill of itself so no part of the panel is cropped away), 30 fps and a
 * stereo AAC track (silence where a clip has none), with its caption
 * burned in; an optional title card opens; clips are joined with hard cuts
 * or short crossfades.
 */

export const EPISODE_FRAME: Record<ExportRatio, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};
export const EPISODE_FPS = 30;
export const CROSSFADE_SECONDS = 0.5;
export const TITLE_CARD_SECONDS = 2.5;

export type EpisodeClipInput = { url: string; caption?: string | null };

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${bin} exited with ${code}: ${stderr.trim().split("\n").slice(-4).join(" | ")}`))
    );
  });
}

async function probeDuration(file: string) {
  const out = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const seconds = Number.parseFloat(out.trim());
  if (!Number.isFinite(seconds)) throw new Error("Could not read clip duration");
  return seconds;
}

async function hasAudio(file: string) {
  const out = await run(FFPROBE, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file]);
  return out.trim().length > 0;
}

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download clip: ${res.status} ${res.statusText}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/** Greedy word wrap — drawtext doesn't wrap on its own. */
export function wrapText(text: string, maxChars: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    if (line && (line + " " + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

const ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(EPISODE_FPS)];
const AUDIO_ENCODE = ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"];
const SILENCE = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];

async function normalizeClip(input: string, out: string, ratio: ExportRatio, caption: string | null | undefined, dir: string, index: number) {
  const { width: W, height: H } = EPISODE_FRAME[ratio];
  const [audio, duration] = await Promise.all([hasAudio(input), probeDuration(input)]);
  const seconds = duration.toFixed(3);

  let video =
    `[0:v]split[a][b];` +
    `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2[bg];` +
    `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${EPISODE_FPS},format=yuv420p`;
  if (caption?.trim()) {
    // textfile avoids escaping user text inside the filter graph.
    const captionFile = join(dir, `caption-${index}.txt`);
    await writeFile(captionFile, wrapText(caption, ratio === "16:9" ? 48 : 28));
    const fontSize = Math.round(Math.min(W, H) / 18);
    video +=
      `,drawtext=textfile=${captionFile}:text_align=C:fontcolor=white:fontsize=${fontSize}:line_spacing=10` +
      `:box=1:boxcolor=black@0.6:boxborderw=20:x=(w-text_w)/2:y=h-text_h-h*0.1`;
  }
  video += "[v]";
  // Audio padded/trimmed to exactly the clip's length. (An open-ended apad
  // with -shortest makes ffmpeg 6 fail with "No space left on device".)
  const audioFilter = audio
    ? `[0:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${seconds},atrim=0:${seconds}[aout]`
    : null;

  await run(FFMPEG, [
    "-y", "-loglevel", "error",
    "-i", input,
    ...(audio ? [] : SILENCE),
    "-filter_complex", audioFilter ? `${video};${audioFilter}` : video,
    "-map", "[v]",
    "-map", audio ? "[aout]" : "1:a",
    "-t", seconds,
    ...ENCODE,
    ...AUDIO_ENCODE,
    out,
  ]);
}

async function titleCard(out: string, ratio: ExportRatio, title: string, dir: string) {
  const { width: W, height: H } = EPISODE_FRAME[ratio];
  const titleFile = join(dir, "title.txt");
  await writeFile(titleFile, wrapText(title, ratio === "16:9" ? 30 : 18));
  const fontSize = Math.round(Math.min(W, H) / 11);
  await run(FFMPEG, [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=0x0b0b10:s=${W}x${H}:r=${EPISODE_FPS}:d=${TITLE_CARD_SECONDS}`,
    ...SILENCE,
    "-vf",
    `drawtext=textfile=${titleFile}:text_align=C:fontcolor=white:fontsize=${fontSize}:line_spacing=14:x=(w-text_w)/2:y=(h-text_h)/2,format=yuv420p`,
    "-t", String(TITLE_CARD_SECONDS),
    ...ENCODE,
    ...AUDIO_ENCODE,
    out,
  ]);
}

async function concatParts(parts: string[], transition: EpisodeTransition, out: string, dir: string) {
  if (parts.length === 1) {
    await run(FFMPEG, ["-y", "-loglevel", "error", "-i", parts[0], "-c", "copy", "-movflags", "+faststart", out]);
    return;
  }
  if (transition === "cut") {
    // Every part has identical codecs/size/fps, so the concat demuxer can copy streams.
    const list = join(dir, "parts.txt");
    await writeFile(list, parts.map((p) => `file '${p}'`).join("\n"));
    await run(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
    return;
  }

  const durations = await Promise.all(parts.map(probeDuration));
  const filters: string[] = [];
  let videoLabel = "[0:v]";
  let audioLabel = "[0:a]";
  let offset = 0;
  for (let i = 1; i < parts.length; i++) {
    offset += durations[i - 1] - CROSSFADE_SECONDS;
    const v = `[v${i}]`;
    const a = `[a${i}]`;
    filters.push(`${videoLabel}[${i}:v]xfade=transition=fade:duration=${CROSSFADE_SECONDS}:offset=${offset.toFixed(3)}${v}`);
    filters.push(`${audioLabel}[${i}:a]acrossfade=d=${CROSSFADE_SECONDS}${a}`);
    videoLabel = v;
    audioLabel = a;
  }
  await run(FFMPEG, [
    "-y", "-loglevel", "error",
    ...parts.flatMap((p) => ["-i", p]),
    "-filter_complex", filters.join(";"),
    "-map", videoLabel,
    "-map", audioLabel,
    ...ENCODE,
    ...AUDIO_ENCODE,
    "-movflags", "+faststart",
    out,
  ]);
}

export async function assembleEpisode({
  clips,
  ratio,
  transition,
  title,
}: {
  clips: EpisodeClipInput[];
  ratio: ExportRatio;
  transition: EpisodeTransition;
  title?: string | null;
}): Promise<{ video: Buffer; durationSeconds: number }> {
  if (clips.length === 0) throw new Error("An episode needs at least one clip");
  const dir = await mkdtemp(join(tmpdir(), "komamotion-episode-"));
  try {
    const parts: string[] = [];
    if (title?.trim()) {
      const card = join(dir, "part-title.mp4");
      await titleCard(card, ratio, title.trim(), dir);
      parts.push(card);
    }
    for (const [i, clip] of clips.entries()) {
      const source = join(dir, `source-${i}.mp4`);
      const normalized = join(dir, `part-${i}.mp4`);
      await download(clip.url, source);
      await normalizeClip(source, normalized, ratio, clip.caption, dir, i);
      parts.push(normalized);
    }
    const out = join(dir, "episode.mp4");
    await concatParts(parts, transition, out, dir);
    return { video: await readFile(out), durationSeconds: await probeDuration(out) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
