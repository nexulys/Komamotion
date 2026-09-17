import { logger, schedules } from "@trigger.dev/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MANGA_SOURCES_BUCKET, RENDERED_VIDEOS_BUCKET } from "@/lib/supabase/signed-url";

const RETENTION_DAYS = 30;
const MAX_USER_FOLDERS_PER_RUN = 200; // bound per-invocation work; a persisted cursor would be the next step past this scale

/**
 * Nightly sweep that deletes storage objects no longer referenced by any
 * row in Postgres — uploads abandoned mid-edit, intermediate files left
 * behind after a project/generation is deleted (storage isn't covered by
 * the DB's `on delete cascade`). Only removes objects older than
 * RETENTION_DAYS so an in-flight upload is never at risk.
 */
export const cleanupStorageTask = schedules.task({
  id: "cleanup-storage",
  cron: "0 4 * * *", // 04:00 UTC daily
  run: async () => {
    const admin = createServiceRoleClient();
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const mangaDeleted = await sweepBucket(admin, MANGA_SOURCES_BUCKET, cutoff, await getReferencedMangaSources(admin));
    const renderedDeleted = await sweepBucket(
      admin,
      RENDERED_VIDEOS_BUCKET,
      cutoff,
      await getReferencedRenderedVideos(admin)
    );

    logger.info("Storage cleanup complete", { mangaDeleted, renderedDeleted });
    return { mangaDeleted, renderedDeleted };
  },
});

async function getReferencedMangaSources(admin: ReturnType<typeof createServiceRoleClient>) {
  const [{ data: generationRows }, { data: panelPages }] = await Promise.all([
    admin.from("generations").select("source_image_url"),
    admin.from("panel_extractions").select("source_page_url, panel_urls"),
  ]);

  const referenced = new Set<string>(generationRows?.map((g) => g.source_image_url) ?? []);
  for (const row of panelPages ?? []) {
    referenced.add(row.source_page_url);
    for (const panelPath of row.panel_urls ?? []) referenced.add(panelPath);
  }
  return referenced;
}

async function getReferencedRenderedVideos(admin: ReturnType<typeof createServiceRoleClient>) {
  const [{ data: generationRows }, { data: exportRows }] = await Promise.all([
    admin.from("generations").select("output_video_url, upscaled_video_url, audio_url"),
    admin.from("generation_exports").select("video_url"),
  ]);

  const referenced = new Set<string>();
  for (const row of generationRows ?? []) {
    if (row.output_video_url) referenced.add(row.output_video_url);
    if (row.upscaled_video_url) referenced.add(row.upscaled_video_url);
    if (row.audio_url) referenced.add(row.audio_url);
  }
  for (const row of exportRows ?? []) {
    if (row.video_url) referenced.add(row.video_url);
  }
  return referenced;
}

async function sweepBucket(
  admin: ReturnType<typeof createServiceRoleClient>,
  bucket: string,
  cutoffMs: number,
  referenced: Set<string>
) {
  let deleted = 0;

  const { data: userFolders } = await admin.storage.from(bucket).list("", {
    limit: MAX_USER_FOLDERS_PER_RUN,
  });

  for (const userFolder of userFolders ?? []) {
    if (!userFolder.id) continue; // skip non-folder entries

    const { data: projectFolders } = await admin.storage.from(bucket).list(userFolder.name, { limit: 500 });

    for (const projectFolder of projectFolders ?? []) {
      if (!projectFolder.id) continue;

      const prefix = `${userFolder.name}/${projectFolder.name}`;
      const { data: files } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
      if (!files || files.length === 0) continue;

      const toDelete = files
        .filter((f) => f.id && new Date(f.created_at ?? 0).getTime() < cutoffMs)
        .map((f) => `${prefix}/${f.name}`)
        .filter((path) => !referenced.has(path));

      if (toDelete.length > 0) {
        await admin.storage.from(bucket).remove(toDelete);
        deleted += toDelete.length;
      }
    }
  }

  return deleted;
}
