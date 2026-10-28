/**
 * Trigger.dev tasks run on Trigger.dev's machines and don't see Vercel's
 * variables: these must exist in its Production environment too. The
 * /admin/setup page checks them and can copy them over from Vercel.
 */
export const TRIGGER_REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "AI_WEBHOOK_SECRET",
  "FAL_KEY",
];

/** Copied along when set in Vercel. */
export const TRIGGER_OPTIONAL_ENV = ["ELEVENLABS_API_KEY", "AI_PROVIDER", "REPLICATE_API_TOKEN", "REPLICATE_MODEL_VERSION"];

/** The Vercel values to copy, split public/secret, and the required ones Vercel lacks. */
export function triggerEnvFromVercel(source: Record<string, string | undefined> = process.env) {
  const publicVars: Record<string, string> = {};
  const secretVars: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of [...TRIGGER_REQUIRED_ENV, ...TRIGGER_OPTIONAL_ENV]) {
    const value = source[name]?.trim();
    if (!value) {
      if (TRIGGER_REQUIRED_ENV.includes(name)) missing.push(name);
      continue;
    }
    (name.startsWith("NEXT_PUBLIC_") || name === "AI_PROVIDER" ? publicVars : secretVars)[name] = value;
  }
  return { publicVars, secretVars, missing };
}
