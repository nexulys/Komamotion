"use server";

import { envvars } from "@trigger.dev/sdk";
import { requireAdmin } from "@/lib/admin/queries";
import { triggerEnvFromVercel } from "@/lib/admin/trigger-env";
import { getStripe } from "@/lib/stripe/server";
import { ensureStripeCatalog, type StripeSetupResult } from "@/lib/stripe/setup";

/** /admin/setup's "create in Stripe" button: plans, credit pack and webhook. */
export async function setupStripe(): Promise<{ data?: StripeSetupResult; error?: string }> {
  await requireAdmin();
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    return { error: "Ajoute d'abord STRIPE_SECRET_KEY dans Vercel, puis redéploie." };
  }
  let origin: string;
  try {
    origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").origin;
  } catch {
    return { error: "NEXT_PUBLIC_APP_URL doit être renseignée pour créer le webhook." };
  }
  if (!origin.startsWith("https://")) return { error: "NEXT_PUBLIC_APP_URL doit commencer par https://." };

  try {
    return { data: await ensureStripeCatalog(getStripe(), origin) };
  } catch (err) {
    console.error("[admin] Stripe setup failed", err);
    return { error: `Stripe a refusé : ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * /admin/setup's "copy to Trigger.dev" button: pushes the variables the
 * tasks need from this deployment's environment (i.e. Vercel's) into
 * Trigger.dev's Production environment, overwriting older values.
 */
export async function syncTriggerEnv(): Promise<{ data?: { copied: string[]; missing: string[] }; error?: string }> {
  await requireAdmin();
  const projectRef = process.env.TRIGGER_PROJECT_REF?.trim();
  if (!process.env.TRIGGER_SECRET_KEY?.trim().startsWith("tr_prod_")) {
    return { error: "Mets d'abord la clé Production de Trigger.dev (tr_prod_…) dans TRIGGER_SECRET_KEY sur Vercel." };
  }
  if (!projectRef) return { error: "Ajoute TRIGGER_PROJECT_REF (proj_…) dans Vercel, puis redéploie." };

  const { publicVars, secretVars, missing } = triggerEnvFromVercel();
  try {
    if (Object.keys(publicVars).length) {
      await envvars.upload(projectRef, "prod", { variables: publicVars, override: true });
    }
    if (Object.keys(secretVars).length) {
      await envvars.upload(projectRef, "prod", { variables: secretVars, override: true, isSecret: true });
    }
  } catch (err) {
    console.error("[admin] Trigger.dev env sync failed", err);
    return {
      error: `Trigger.dev a refusé (${err instanceof Error ? err.message : String(err)}). Ajoute-les à la main : guide §4.3.`,
    };
  }
  return { data: { copied: [...Object.keys(publicVars), ...Object.keys(secretVars)], missing } };
}
