import { fal } from "@fal-ai/client";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  fal.config({ credentials: process.env.FAL_KEY });
  configured = true;
}

const NSFW_ENDPOINT = "fal-ai/imageutils/nsfw";
/**
 * Probability above which an image is refused. Manga regularly has
 * suggestive-but-allowed art, so this only stops clearly explicit images;
 * lower it if review of flagged/unflagged renders shows it's too lenient.
 */
export const NSFW_THRESHOLD = 0.8;

export const CONTENT_REJECTED_MESSAGE =
  "This image can't be processed: it was flagged as explicit content, which our terms don't allow. Your credits were refunded.";

/** Thrown when an image is refused — callers fail the job (and refund) without retrying. */
export class ContentRejectedError extends Error {
  constructor(public readonly probability: number) {
    super(CONTENT_REJECTED_MESSAGE);
    this.name = "ContentRejectedError";
  }
}

/**
 * Checks an image before any AI processing. Fails closed: if the check
 * itself errors, the caller's job errors too (and is retried, then
 * refunded) rather than processing an unchecked image.
 */
export async function assertImageAllowed(imageUrl: string): Promise<void> {
  ensureConfigured();
  const result = await fal.run(NSFW_ENDPOINT, { input: { image_url: imageUrl } });
  const probability = result.data.nsfw_probability;
  if (typeof probability !== "number") throw new Error("Moderation returned no score");
  if (probability >= NSFW_THRESHOLD) throw new ContentRejectedError(probability);
}
