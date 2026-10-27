import { fal } from "@fal-ai/client";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  fal.config({ credentials: process.env.FAL_KEY });
  configured = true;
}

const COLORIZE_ENDPOINT = "fal-ai/flux-pro/kontext";
const COLORIZE_PROMPT =
  "Colorize this black-and-white manga panel with vibrant, natural anime colors. " +
  "Keep the line art, composition, characters, faces and any remaining text exactly as they are.";

/**
 * The "Colorize" option: an instruction-following image edit (FLUX.1
 * Kontext) turns a black-and-white panel into a color one before it is
 * animated — the video model itself only animates what it is given.
 */
export async function colorizePanel(imageUrl: string): Promise<string> {
  ensureConfigured();
  const result = await fal.run(COLORIZE_ENDPOINT, {
    input: { image_url: imageUrl, prompt: COLORIZE_PROMPT, output_format: "png" },
  });
  const url = result.data.images?.[0]?.url;
  if (!url) throw new Error("Colorization did not return an image");
  return url;
}
