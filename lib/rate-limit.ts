import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
function getRedis() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    redis = new Redis({ url, token });
  }
  return redis;
}

/**
 * Per-user/IP limiters for the costly AI generation endpoints. Each is
 * created lazily and only if Upstash credentials are configured, so local
 * dev without Redis degrades to "no rate limiting" instead of crashing.
 */
const limiters = {
  // Expensive image-to-video renders: 5 starts per minute per user.
  generation: () =>
    new Ratelimit({
      redis: getRedis()!,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      analytics: true,
      prefix: "ratelimit:generation",
    }),
  // Panel extraction / inpainting / upscaling / audio add-ons: 15/min.
  aiUtility: () =>
    new Ratelimit({
      redis: getRedis()!,
      limiter: Ratelimit.slidingWindow(15, "1 m"),
      analytics: true,
      prefix: "ratelimit:ai-utility",
    }),
  // Export/download endpoints: 30/min.
  export: () =>
    new Ratelimit({
      redis: getRedis()!,
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      analytics: true,
      prefix: "ratelimit:export",
    }),
  // Inbound webhooks, keyed by remote IP: 120/min — generous, just abuse control.
  webhook: () =>
    new Ratelimit({
      redis: getRedis()!,
      limiter: Ratelimit.slidingWindow(120, "1 m"),
      analytics: true,
      prefix: "ratelimit:webhook",
    }),
} as const;

export type RateLimitBucket = keyof typeof limiters;

export interface RateLimitResult {
  ok: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
}

/**
 * Checks (and consumes) one request against the named bucket for `key`
 * (typically a user id or IP). Returns `{ ok: true }` when Redis isn't
 * configured — fail-open in dev, fail-closed only once Upstash is wired
 * up, matching how most teams roll rate limiting out incrementally.
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  key: string
): Promise<RateLimitResult> {
  if (!getRedis()) {
    return { ok: true };
  }

  const { success, limit, remaining, reset } = await limiters[bucket]().limit(key);
  return { ok: success, limit, remaining, reset };
}

export class RateLimitError extends Error {
  constructor(public result: RateLimitResult) {
    super("Rate limit exceeded. Please slow down and try again shortly.");
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(bucket: RateLimitBucket, key: string) {
  const result = await checkRateLimit(bucket, key);
  if (!result.ok) {
    throw new RateLimitError(result);
  }
}
