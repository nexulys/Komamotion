import type { AiProvider, CameraMovement, GenerationStatus, Resolution } from "@/lib/supabase/types";

export interface ImageToVideoParams {
  imageUrl: string;
  prompt?: string | null;
  cameraMovement: CameraMovement;
  motionIntensity: number;
  fps: number;
  resolution: Resolution;
  durationSeconds: number;
  colorize: boolean;
  webhookUrl?: string;
}

export interface AiJobHandle {
  provider: AiProvider;
  externalJobId: string;
}

export interface AiJobStatus {
  status: GenerationStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  progress?: number;
}

export interface ImageToVideoConnector {
  provider: AiProvider;
  submit(params: ImageToVideoParams): Promise<AiJobHandle>;
  getStatus(externalJobId: string): Promise<AiJobStatus>;
}
