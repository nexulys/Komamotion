import { fal } from "@fal-ai/client";
import sharp from "sharp";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  fal.config({ credentials: process.env.FAL_KEY });
  configured = true;
}

interface DetectedRegion {
  label: string;
  bbox: [number, number, number, number]; // x1, y1, x2, y2 in pixels
}

const GROUNDING_ENDPOINT = "fal-ai/florence-2-large/caption-to-phrase-grounding";
const INPAINT_ENDPOINT = "fal-ai/lama";
const DETECTION_PROMPT = "speech bubble, text balloon, onomatopoeia, sound effect text";

/**
 * Detects speech bubbles / SFX text on a manga panel via open-vocabulary
 * grounding, then feeds a generated mask to a LaMa inpainting model to
 * erase them cleanly before the panel is animated.
 */
export async function removeTextFromPanel(imageUrl: string): Promise<{
  cleanedImageUrl: string;
  regionsRemoved: number;
}> {
  ensureConfigured();

  const regions = await detectTextRegions(imageUrl);
  if (regions.length === 0) {
    return { cleanedImageUrl: imageUrl, regionsRemoved: 0 };
  }

  const maskUrl = await buildMaskFromRegions(imageUrl, regions);

  const result = await fal.run(INPAINT_ENDPOINT, {
    input: { image_url: imageUrl, mask_url: maskUrl },
  });

  const data = result.data as { image?: { url?: string } };
  if (!data.image?.url) {
    throw new Error("Inpainting did not return an output image");
  }

  return { cleanedImageUrl: data.image.url, regionsRemoved: regions.length };
}

async function detectTextRegions(imageUrl: string): Promise<DetectedRegion[]> {
  const result = await fal.run(GROUNDING_ENDPOINT, {
    input: { image_url: imageUrl, text_input: DETECTION_PROMPT },
  });

  const bboxes = result.data.results?.bboxes ?? [];

  return bboxes.map((box) => ({
    label: box.label,
    bbox: [box.x, box.y, box.x + box.w, box.y + box.h],
  }));
}

/** Builds a black/white PNG mask (white = inpaint) matching the source image size. */
async function buildMaskFromRegions(imageUrl: string, regions: DetectedRegion[]) {
  const response = await fetch(imageUrl);
  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(sourceBuffer).metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1024;

  const padding = 6;
  const rects = regions
    .map(({ bbox: [x1, y1, x2, y2] }) => {
      const rx = Math.max(0, Math.round(x1) - padding);
      const ry = Math.max(0, Math.round(y1) - padding);
      const rw = Math.min(width - rx, Math.round(x2 - x1) + padding * 2);
      const rh = Math.min(height - ry, Math.round(y2 - y1) + padding * 2);
      return `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="8" fill="white" />`;
    })
    .join("");

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="black" />
    ${rects}
  </svg>`;

  const maskBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return fal.storage.upload(new Blob([maskBuffer], { type: "image/png" }));
}
