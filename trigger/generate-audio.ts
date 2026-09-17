import { logger, task } from "@trigger.dev/sdk";
import { buildAudioPrompt, generateSceneAudio } from "@/lib/ai/audio";
import { muxAudio } from "@/lib/media/ffmpeg";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RENDERED_VIDEOS_BUCKET, buildStoragePath, uploadBufferToStorage } from "@/lib/supabase/signed-url";
import { refundCredits } from "@/lib/generation/pipeline";

/**
 * On-demand ambient sound/SFX generation for a completed render
 * (ElevenLabs), muxed onto the video with ffmpeg. Overwrites
 * output_video_url with the version that has audio baked in; the raw
 * track stays at audio_url for reference/download.
 */
export const generateAudioTask = task({
  id: "generate-audio",
  retry: { maxAttempts: 3, minTimeoutInMs: 5000, maxTimeoutInMs: 45_000, factor: 2 },
  run: async (payload: { generationId: string; creditsCost: number }) => {
    const admin = createServiceRoleClient();

    const { data: generation } = await admin
      .from("generations")
      .select("*")
      .eq("id", payload.generationId)
      .single();

    if (!generation?.output_video_url) {
      throw new Error("No output video to add audio to");
    }

    const prompt = buildAudioPrompt({
      userPrompt: generation.prompt,
      cameraMovement: generation.camera_movement,
    });

    const audioBuffer = await generateSceneAudio({
      prompt,
      durationSeconds: generation.duration_seconds,
    });

    const audioPath = buildStoragePath(generation.user_id, generation.project_id, "scene-audio.mp3");
    await uploadBufferToStorage(RENDERED_VIDEOS_BUCKET, audioPath, audioBuffer, "audio/mpeg");

    const muxedBuffer = await muxAudio(generation.output_video_url, audioBuffer);
    const videoPath = buildStoragePath(generation.user_id, generation.project_id, "with-audio.mp4");
    await uploadBufferToStorage(RENDERED_VIDEOS_BUCKET, videoPath, muxedBuffer, "video/mp4");

    await admin
      .from("generations")
      .update({ audio_url: audioPath, output_video_url: videoPath })
      .eq("id", generation.id);

    logger.info("Audio generated and muxed", { generationId: generation.id });
  },
  onFailure: async ({ payload }) => {
    const admin = createServiceRoleClient();
    const { data: generation } = await admin
      .from("generations")
      .select("user_id")
      .eq("id", payload.generationId)
      .single();

    if (generation) {
      await refundCredits(admin, {
        userId: generation.user_id,
        amount: payload.creditsCost,
        generationId: payload.generationId,
        description: "Refund for failed audio generation",
      });
    }
  },
});
