import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/CLI-dependent packages used only in server actions, route
  // handlers, and Trigger.dev tasks — never bundled for the client.
  serverExternalPackages: ["sharp", "fluent-ffmpeg"],
};

export default nextConfig;
