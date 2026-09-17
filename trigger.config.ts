import { defineConfig } from "@trigger.dev/sdk";
import { ffmpeg } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  // Replace with your project ref from the Trigger.dev dashboard
  // (Project settings → Project ref), or run `npx trigger.dev@latest init`
  // to have the CLI fill this in for you.
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_replace_me",
  dirs: ["./trigger"],
  maxDuration: 900, // 15 min ceiling — video render/upscale/mux jobs are long-running but bounded
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 2000,
      maxTimeoutInMs: 60_000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    // Installs ffmpeg/ffprobe in the deployed image and sets
    // FFMPEG_PATH / FFPROBE_PATH for lib/media/ffmpeg.ts.
    extensions: [ffmpeg({ version: "7" })],
  },
});
