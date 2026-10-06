import { createServiceRoleClient } from "@/lib/supabase/server";

export const MANGA_SOURCES_BUCKET = "manga-sources";
export const RENDERED_VIDEOS_BUCKET = "rendered-videos";

const DEFAULT_EXPIRY_SECONDS = 60 * 60 * 2; // 2h — long enough for an AI provider to fetch a source image.

/**
 * Both storage buckets are private (see migration 0002). AI providers and
 * the browser never get a permanent public URL — they get a short-lived
 * signed URL minted on demand, so a leaked link expires and deleted
 * projects can't be scraped from a stale CDN cache.
 */
export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = DEFAULT_EXPIRY_SECONDS
) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Could not sign URL for ${bucket}/${path}: ${error?.message}`);
  }

  return data.signedUrl;
}

export async function createSignedUrls(
  bucket: string,
  paths: string[],
  expiresInSeconds = DEFAULT_EXPIRY_SECONDS
) {
  if (paths.length === 0) return [];
  const admin = createServiceRoleClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrls(paths, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Could not sign URLs for ${bucket}: ${error?.message}`);
  }

  return data;
}

/** Builds the owner-scoped storage path new uploads must use for RLS to apply. */
export function buildStoragePath(userId: string, projectId: string, filename: string) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${userId}/${projectId}/${crypto.randomUUID()}-${safeName}`;
}

export async function uploadBufferToStorage(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
) {
  const admin = createServiceRoleClient();
  const { error } = await admin.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Could not upload to ${bucket}/${path}: ${error.message}`);
  }

  return path;
}

export async function deleteFromStorage(bucket: string, paths: string[]) {
  if (paths.length === 0) return;
  const admin = createServiceRoleClient();
  await admin.storage.from(bucket).remove(paths);
}

/**
 * DB columns like `source_image_url` / `output_video_url` hold either a
 * full external URL (the AI provider's own CDN — used as-is) or a path
 * inside one of our private buckets (once we've stored our own processed
 * output — watermarked/upscaled video, muxed audio). This resolves either
 * shape into something a browser can actually fetch.
 */
export async function resolveMediaUrl(
  bucket: string,
  value: string | null | undefined,
  expiresInSeconds = DEFAULT_EXPIRY_SECONDS
): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    return await createSignedUrl(bucket, value, expiresInSeconds);
  } catch {
    return null;
  }
}
