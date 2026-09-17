const ELEVENLABS_SOUND_GENERATION_URL = "https://api.elevenlabs.io/v1/sound-generation";

/**
 * Generates an ambient sound bed / SFX clip matching the scene via
 * ElevenLabs' sound-generation API. Returns raw MP3 bytes — the caller
 * (a Trigger.dev task) stores them and muxes with the rendered video via
 * ffmpeg (see lib/media/ffmpeg.ts).
 */
export async function generateSceneAudio({
  prompt,
  durationSeconds,
}: {
  prompt: string;
  durationSeconds: number;
}): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const response = await fetch(ELEVENLABS_SOUND_GENERATION_URL, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: Math.min(22, Math.max(0.5, durationSeconds)),
      prompt_influence: 0.35,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs sound generation failed: ${message}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Builds a sound-design prompt from the same motion settings used for the video. */
export function buildAudioPrompt({
  userPrompt,
  cameraMovement,
}: {
  userPrompt?: string | null;
  cameraMovement: string;
}) {
  const base = userPrompt?.trim() || "atmospheric manga scene ambience";
  return `${base}, subtle ${cameraMovement.replace("_", " ")} sound design, cinematic anime sound effects, no dialogue, no music`;
}
