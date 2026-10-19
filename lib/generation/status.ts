import type { GenerationRow } from "@/lib/supabase/types";

/**
 * A render is ready once post-processing has finished (progress 100) — for
 * free plans that's when the watermark is burned in. Until then the editor
 * shows it as still rendering, and exports / 4K / sound / downloads wait.
 */
export function isGenerationFinalized(generation: Pick<GenerationRow, "status" | "progress">) {
  return generation.status === "completed" && generation.progress >= 100;
}
