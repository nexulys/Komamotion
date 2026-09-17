import type { AiProvider } from "@/lib/supabase/types";
import type { AiJobHandle, AiJobStatus, ImageToVideoParams } from "@/lib/ai/types";
import { falConnector } from "@/lib/ai/fal";
import { replicateConnector } from "@/lib/ai/replicate";

const CONNECTORS = {
  fal: falConnector,
  replicate: replicateConnector,
} as const;

export function getDefaultProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER;
  return provider === "replicate" ? "replicate" : "fal";
}

export async function createVideoGeneration(
  params: ImageToVideoParams,
  provider: AiProvider = getDefaultProvider()
): Promise<AiJobHandle> {
  return CONNECTORS[provider].submit(params);
}

export async function getVideoGenerationStatus(
  provider: AiProvider,
  externalJobId: string
): Promise<AiJobStatus> {
  return CONNECTORS[provider].getStatus(externalJobId);
}

export * from "@/lib/ai/types";
