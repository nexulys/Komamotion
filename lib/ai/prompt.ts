import type { CameraMovement } from "@/lib/supabase/types";

const CAMERA_MOVEMENT_PHRASES: Record<CameraMovement, string> = {
  static: "locked-off static camera, subtle idle motion only",
  pan_left: "smooth camera pan to the left",
  pan_right: "smooth camera pan to the right",
  zoom_in: "slow cinematic zoom in on the subject",
  zoom_out: "slow cinematic zoom out revealing the scene",
  dolly_in: "dolly-in camera push toward the subject",
  orbit: "gentle orbital camera movement around the subject",
};

/**
 * Builds the text prompt fragment sent to the image-to-video model,
 * combining the user's own prompt with the structured camera/intensity
 * controls exposed in the editor UI.
 */
export function buildMotionPrompt({
  userPrompt,
  cameraMovement,
  motionIntensity,
}: {
  userPrompt?: string | null;
  cameraMovement: CameraMovement;
  motionIntensity: number;
}) {
  const intensityWord =
    motionIntensity < 0.34 ? "subtle" : motionIntensity < 0.67 ? "moderate" : "dynamic";

  const parts = [
    userPrompt?.trim(),
    CAMERA_MOVEMENT_PHRASES[cameraMovement],
    `${intensityWord} animation intensity`,
    "anime manga panel brought to life, fluid motion, consistent character design, high detail",
  ].filter(Boolean);

  return parts.join(", ");
}
