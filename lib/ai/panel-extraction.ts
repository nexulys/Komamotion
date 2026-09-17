import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { MANGA_SOURCES_BUCKET, buildStoragePath, uploadBufferToStorage } from "@/lib/supabase/signed-url";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  fal.config({ credentials: process.env.FAL_KEY });
  configured = true;
}

const GROUNDING_ENDPOINT = "fal-ai/florence-2-large/caption-to-phrase-grounding";
const PANEL_PROMPT = "comic panel, manga panel frame";
const MIN_PANEL_AREA_RATIO = 0.03; // ignore tiny false-positive boxes

/**
 * Auto-splits a full manga page into individual panels: detects panel
 * frames via open-vocabulary grounding, crops each with sharp, and stores
 * the crops as new manga-source panels the user can pick from in the
 * editor. Falls back to the untouched page (as a single "panel") if no
 * frames are confidently detected, so the feature degrades gracefully
 * instead of producing a bad split.
 */
export async function extractPanelsFromPage({
  pageImageUrl,
  userId,
  projectId,
}: {
  pageImageUrl: string;
  userId: string;
  projectId: string;
}): Promise<{ panelPaths: string[] }> {
  ensureConfigured();

  const response = await fetch(pageImageUrl);
  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const image = sharp(sourceBuffer);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) {
    throw new Error("Could not read source page dimensions");
  }

  const boxes = await detectPanelBoxes(pageImageUrl, width, height);

  if (boxes.length === 0) {
    const path = await storeCrop(sourceBuffer, userId, projectId, "page-1");
    return { panelPaths: [path] };
  }

  const ordered = sortMangaReadingOrder(boxes);

  const panelPaths: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const [x1, y1, x2, y2] = ordered[i];
    const left = Math.max(0, Math.round(x1));
    const top = Math.max(0, Math.round(y1));
    const cropWidth = Math.min(width - left, Math.round(x2 - x1));
    const cropHeight = Math.min(height - top, Math.round(y2 - y1));
    if (cropWidth <= 0 || cropHeight <= 0) continue;

    const cropBuffer = await sharp(sourceBuffer)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();

    panelPaths.push(await storeCrop(cropBuffer, userId, projectId, `panel-${i + 1}`));
  }

  return { panelPaths };
}

async function detectPanelBoxes(
  imageUrl: string,
  width: number,
  height: number
): Promise<[number, number, number, number][]> {
  const result = await fal.run(GROUNDING_ENDPOINT, {
    input: { image_url: imageUrl, text_input: PANEL_PROMPT },
  });

  const bboxes = result.data.results?.bboxes ?? [];
  const minArea = width * height * MIN_PANEL_AREA_RATIO;

  return bboxes
    .map((box): [number, number, number, number] => [box.x, box.y, box.x + box.w, box.y + box.h])
    .filter(([x1, y1, x2, y2]) => (x2 - x1) * (y2 - y1) >= minArea);
}

/** Manga reads right-to-left, top-to-bottom: sort rows top-down, panels within a row right-to-left. */
function sortMangaReadingOrder(
  boxes: [number, number, number, number][]
): [number, number, number, number][] {
  const rowThreshold = 40;
  const sorted = [...boxes].sort((a, b) => a[1] - b[1]);
  const rows: [number, number, number, number][][] = [];

  for (const box of sorted) {
    const row = rows.find((r) => Math.abs(r[0][1] - box[1]) < rowThreshold);
    if (row) row.push(box);
    else rows.push([box]);
  }

  return rows.flatMap((row) => row.sort((a, b) => b[0] - a[0]));
}

async function storeCrop(buffer: Buffer, userId: string, projectId: string, name: string) {
  const path = buildStoragePath(userId, projectId, `${name}.png`);
  return uploadBufferToStorage(MANGA_SOURCES_BUCKET, path, buffer, "image/png");
}
