import type Stripe from "stripe";
import { Redis } from "@upstash/redis";
import { deployments, envvars } from "@trigger.dev/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MANGA_SOURCES_BUCKET, RENDERED_VIDEOS_BUCKET } from "@/lib/supabase/signed-url";
import { getStripe } from "@/lib/stripe/server";
import {
  priceProblems,
  STRIPE_CATALOG,
  STRIPE_WEBHOOK_EVENTS,
  STRIPE_WEBHOOK_PATH,
  type CatalogEntry,
  type PriceLike,
} from "@/lib/stripe/catalog";
import { PROVIDER_COST_PER_SECOND } from "@/lib/ai/costs";
import { DEFAULT_VIDEO_MODEL, VIDEO_MODELS } from "@/lib/ai/video-models";
import { TRIGGER_REQUIRED_ENV } from "@/lib/admin/trigger-env";

/**
 * Everything /admin/setup checks, service by service, in the order of
 * docs/MISE_EN_PRODUCTION.md (texts are in French, like the guide). Each
 * check reads configuration or makes one harmless read-only call; none
 * shows a secret value.
 */

export type CheckStatus = "ok" | "warning" | "error" | "manual";

export type SetupCheck = { label: string; status: CheckStatus; detail: string };

export type SetupSection = { id: string; title: string; guide: string; checks: SetupCheck[] };

const TIMEOUT_MS = 8000;

const ok = (label: string, detail: string): SetupCheck => ({ label, status: "ok", detail });
const warning = (label: string, detail: string): SetupCheck => ({ label, status: "warning", detail });
const error = (label: string, detail: string): SetupCheck => ({ label, status: "error", detail });
const manual = (label: string, detail: string): SetupCheck => ({ label, status: "manual", detail });

function env(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("pas de réponse après 8 s")), TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs a group of checks; if one throws unexpectedly, the section still renders. */
async function guarded(label: string, run: () => Promise<SetupCheck | SetupCheck[]>): Promise<SetupCheck[]> {
  try {
    const result = await run();
    return Array.isArray(result) ? result : [result];
  } catch (err) {
    return [warning(label, `Vérification impossible : ${message(err)}`)];
  }
}

// ── Pure evaluations (unit-tested) ─────────────────────────────────────

export function checkAppUrl(appUrl: string | null, requestOrigin: string | null): SetupCheck {
  const label = "Adresse du site (NEXT_PUBLIC_APP_URL)";
  if (!appUrl) {
    return error(label, "Absente : les e-mails, les paiements et les tâches de fond ne savent pas où renvoyer.");
  }
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    return error(label, `« ${appUrl} » n'est pas une adresse valide (exemple : https://komamotion.vercel.app).`);
  }
  if (url.protocol !== "https:") return error(label, `${appUrl} doit commencer par https://.`);
  if (url.pathname !== "/" || appUrl.endsWith("/")) {
    return warning(label, `${appUrl} : mets seulement l'adresse, sans « / » ni chemin à la fin.`);
  }
  if (requestOrigin && url.origin !== requestOrigin && !requestOrigin.includes("localhost")) {
    return warning(
      label,
      `Vaut ${url.origin} alors que tu consultes le site sur ${requestOrigin}. Si c'est ta vraie adresse, mets-la à jour (et la Site URL de Supabase).`
    );
  }
  return ok(label, url.origin);
}

export function checkTriggerKey(key: string | null): SetupCheck {
  const label = "Clé Trigger.dev (TRIGGER_SECRET_KEY)";
  if (!key) return error(label, "Absente dans Vercel : aucun rendu, export ni découpage ne peut démarrer.");
  if (key.startsWith("tr_prod_")) return ok(label, "Clé de production.");
  if (key.startsWith("tr_dev_")) {
    return error(label, "C'est la clé de développement (tr_dev_…) : mets la clé Production (tr_prod_…).");
  }
  return warning(label, "Ce n'est pas une clé de production (tr_prod_…).");
}

export function checkCaptcha(supabaseRequiresCaptcha: boolean, siteKeySet: boolean): SetupCheck {
  const label = "Captcha anti-robots";
  if (supabaseRequiresCaptcha && !siteKeySet) {
    return error(
      label,
      "Supabase exige un captcha mais le site ne l'affiche pas : PERSONNE ne peut se connecter. Ajoute NEXT_PUBLIC_TURNSTILE_SITE_KEY dans Vercel (ou désactive le captcha dans Supabase)."
    );
  }
  if (!supabaseRequiresCaptcha && siteKeySet) {
    return warning(label, "Le site affiche le captcha mais Supabase ne le vérifie pas : active-le dans Authentication → Attack Protection.");
  }
  if (!supabaseRequiresCaptcha) {
    return warning(label, "Pas de captcha : un robot peut créer des milliers de comptes pour les crédits gratuits.");
  }
  return ok(label, "Actif sur le site et vérifié par Supabase.");
}

export function checkGoogle(providerEnabled: boolean, buttonShown: boolean): SetupCheck {
  const label = "Connexion Google (optionnelle)";
  if (buttonShown && !providerEnabled) {
    return error(label, "Le bouton Google est affiché mais Google n'est pas activé dans Supabase : la connexion échoue.");
  }
  if (providerEnabled && !buttonShown) {
    return warning(label, "Activée dans Supabase mais bouton masqué : mets NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = true dans Vercel.");
  }
  return ok(label, providerEnabled ? "Active." : "Désactivée (optionnel).");
}

export function checkStripePrice(entry: CatalogEntry, priceId: string | null, price: PriceLike | null): SetupCheck {
  const label = `${entry.name} (${entry.envVar})`;
  const expected = `${entry.amount / 100} $${entry.recurring ? " / mois" : " en une fois"}`;
  if (!priceId) return error(label, `Absent : crée le prix ${expected} dans Stripe et mets son identifiant price_… dans Vercel.`);
  if (!price) return error(label, `${priceId} n'existe pas avec cette clé Stripe (mode test ou live différent ?).`);
  const problems = priceProblems(entry, price);
  return problems.length ? error(label, `${problems.join(", ")} (attendu : ${expected}).`) : ok(label, expected);
}

type WebhookLike = Pick<Stripe.WebhookEndpoint, "url" | "status" | "enabled_events">;

export function checkStripeWebhook(endpoints: WebhookLike[], appOrigin: string | null): SetupCheck {
  const label = "Webhook Stripe";
  if (!appOrigin) return error(label, "Impossible à vérifier sans NEXT_PUBLIC_APP_URL.");
  const expectedUrl = `${appOrigin}${STRIPE_WEBHOOK_PATH}`;
  const endpoint = endpoints.find((e) => e.url === expectedUrl);
  if (!endpoint) {
    return error(label, `Aucun webhook vers ${expectedUrl} : les paiements ne créditeraient personne.`);
  }
  if (endpoint.status !== "enabled") return error(label, `Le webhook vers ${expectedUrl} est désactivé.`);
  const missing = endpoint.enabled_events.includes("*")
    ? []
    : STRIPE_WEBHOOK_EVENTS.filter((event) => !endpoint.enabled_events.includes(event));
  if (missing.length) return error(label, `Événements manquants : ${missing.join(", ")}.`);
  return ok(label, `${expectedUrl}, ${STRIPE_WEBHOOK_EVENTS.length} événements.`);
}

export function checkTriggerEnv(
  vars: { name: string; value: string; isSecret?: boolean }[],
  vercel: { appUrl: string | null; supabaseUrl: string | null; audioEnabled: boolean }
): SetupCheck {
  const label = "Variables d'environnement Trigger.dev (Production)";
  const names = new Set(vars.map((v) => v.name));
  const required = [...TRIGGER_REQUIRED_ENV, ...(vercel.audioEnabled ? ["ELEVENLABS_API_KEY"] : [])];
  const missing = required.filter((name) => !names.has(name));
  if (missing.length) return error(label, `Manquantes : ${missing.join(", ")}.`);
  const differs = (name: string, expected: string | null) => {
    const v = vars.find((x) => x.name === name);
    return Boolean(expected && v && !v.isSecret && v.value.replace(/\/$/, "") !== expected.replace(/\/$/, ""));
  };
  const mismatched = [
    differs("NEXT_PUBLIC_APP_URL", vercel.appUrl) && "NEXT_PUBLIC_APP_URL",
    differs("NEXT_PUBLIC_SUPABASE_URL", vercel.supabaseUrl) && "NEXT_PUBLIC_SUPABASE_URL",
  ].filter(Boolean);
  if (mismatched.length) return error(label, `Différentes de Vercel : ${mismatched.join(", ")}.`);
  return ok(label, `${required.length} variables nécessaires présentes.`);
}

export type FalPrice = { endpoint_id: string; unit_price: number; unit: string; currency: string };

export function checkFalPrices(prices: FalPrice[]): SetupCheck {
  const label = "Prix réels des modèles vidéo";
  const lines = Object.values(VIDEO_MODELS).map((model) => {
    const price = prices.find((p) => p.endpoint_id === model.endpoint);
    return price ? `${model.label} : ${price.unit_price} ${price.currency} / ${price.unit}` : `${model.label} : prix inconnu`;
  });
  const assumed = PROVIDER_COST_PER_SECOND.fal["1080p"];
  const current = prices.find((p) => p.endpoint_id === VIDEO_MODELS[DEFAULT_VIDEO_MODEL].endpoint);
  if (current && /second/i.test(current.unit) && current.unit_price > assumed) {
    return warning(
      label,
      `Le modèle par défaut coûte ${current.unit_price} $/s, plus que les ${assumed} $/s prévus : la marge baisse, demande-moi d'ajuster les prix. ${lines.join(" · ")}`
    );
  }
  return ok(label, lines.join(" · "));
}

// ── Live checks, one section per service ───────────────────────────────

async function siteSection(requestOrigin: string | null): Promise<SetupSection> {
  return {
    id: "site",
    title: "Site et hébergement",
    guide: "§0, §2.2",
    checks: [
      checkAppUrl(env("NEXT_PUBLIC_APP_URL"), requestOrigin),
      manual("Vercel Pro", "Obligatoire avant d'encaisser un paiement (usage commercial). À vérifier dans Vercel → Settings → Billing."),
      manual(
        "Adresses autorisées Supabase",
        "Authentication → URL Configuration : Site URL = l'adresse du site, Redirect URLs = l'adresse suivie de /**."
      ),
    ],
  };
}

async function databaseSection(): Promise<SetupSection> {
  const section = { id: "database", title: "Supabase : base de données", guide: "§2.1" };
  if (!env("NEXT_PUBLIC_SUPABASE_URL") || !env("SUPABASE_SERVICE_ROLE_KEY")) {
    return {
      ...section,
      checks: [error("Connexion à la base", "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absente dans Vercel.")],
    };
  }
  const admin = createServiceRoleClient();
  const signal = () => AbortSignal.timeout(TIMEOUT_MS);
  const missingSchema = (code: string | undefined) => code === "PGRST205" || code === "42P01" || code === "42703";

  const checks = await Promise.all([
    guarded("Connexion à la base", async () => {
      const { count, error: e } = await admin.from("users").select("id", { count: "exact", head: true }).abortSignal(signal());
      return e
        ? error("Connexion à la base", e.message)
        : ok("Connexion à la base", `${count ?? 0} compte${count === 1 ? "" : "s"}.`);
    }),
    guarded("Migration 0005", async () => {
      const { error: e } = await admin.from("generations").select("upscale_status, audio_status").limit(1).abortSignal(signal());
      if (!e) return ok("Migration 0005 (suivi 4K / son)", "Appliquée.");
      return missingSchema(e.code)
        ? error("Migration 0005 (suivi 4K / son)", "Pas appliquée : lance 0005_enhancement_job_status.sql dans le SQL Editor.")
        : warning("Migration 0005 (suivi 4K / son)", e.message);
    }),
    guarded("Migration 0006", async () => {
      const { error: e } = await admin.from("episodes").select("id").limit(1).abortSignal(signal());
      if (!e) return ok("Migration 0006 (épisodes)", "Appliquée.");
      return missingSchema(e.code)
        ? error("Migration 0006 (épisodes)", "Pas appliquée : lance 0006_episodes.sql dans le SQL Editor.")
        : warning("Migration 0006 (épisodes)", e.message);
    }),
    ...[MANGA_SOURCES_BUCKET, RENDERED_VIDEOS_BUCKET].map((bucket) =>
      guarded(`Stockage ${bucket}`, async () => {
        const { data, error: e } = await withTimeout(admin.storage.getBucket(bucket));
        if (e && !/not found/i.test(e.message)) throw e;
        if (!data) return error(`Stockage ${bucket}`, "Introuvable : la migration 0001 n'a pas créé ce dossier de stockage.");
        return data.public
          ? error(`Stockage ${bucket}`, "Public : n'importe qui peut lire les fichiers. Repasse-le en privé dans Storage.")
          : ok(`Stockage ${bucket}`, "Privé.");
      })
    ),
  ]);
  return { ...section, checks: checks.flat() };
}

async function authSection(): Promise<SetupSection> {
  const section = { id: "auth", title: "Supabase : comptes et e-mails", guide: "§2.3 à §2.6" };
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    return { ...section, checks: [error("Réglages de connexion", "NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY absente dans Vercel.")] };
  }
  const headers = { apikey: anonKey, "Content-Type": "application/json" };

  const settings = guarded("Réglages de connexion", async () => {
    const res = await fetch(`${url}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
    const s = (await res.json()) as { disable_signup?: boolean; mailer_autoconfirm?: boolean; external?: Record<string, boolean> };
    return [
      s.disable_signup
        ? error("Inscriptions", "Désactivées dans Supabase (Authentication → Sign In / Providers) : personne ne peut créer de compte.")
        : ok("Inscriptions", "Ouvertes."),
      s.mailer_autoconfirm
        ? warning(
            "Confirmation de l'e-mail",
            "Désactivée : on peut créer des comptes avec de fausses adresses pour récupérer les crédits gratuits. Active « Confirm email »."
          )
        : ok("Confirmation de l'e-mail", "Les nouvelles adresses sont vérifiées par e-mail."),
      checkGoogle(Boolean(s.external?.google), process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true"),
    ];
  });

  // A sign-in attempt for an address that doesn't exist, without a captcha
  // token: Supabase answers "captcha…" when it requires one, "invalid
  // credentials" otherwise. Nothing is created.
  const captcha = guarded("Captcha anti-robots", async () => {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "setup-check@example.com", password: "setup-check-not-a-password" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 429) throw new Error("trop de tentatives, réessaie dans quelques minutes");
    return checkCaptcha(/captcha/i.test(await res.text()), Boolean(env("NEXT_PUBLIC_TURNSTILE_SITE_KEY")));
  });

  const checks = (await Promise.all([settings, captcha])).flat();
  checks.push(
    manual(
      "Envoi des e-mails (SMTP)",
      "Impossible à vérifier d'ici. Test : « Forgot password? » sur le site avec ton adresse ; sans SMTP (Resend), tes clients ne reçoivent rien."
    )
  );
  return { ...section, checks };
}

async function triggerSection(): Promise<SetupSection> {
  const section = { id: "trigger", title: "Trigger.dev : tâches de fond", guide: "§4" };
  const key = env("TRIGGER_SECRET_KEY");
  if (!key) return { ...section, checks: [checkTriggerKey(key)] };

  const deployed = guarded("Tâches déployées", async () => {
    try {
      const current = await withTimeout(deployments.retrieveCurrent());
      return current.status === "DEPLOYED"
        ? ok("Tâches déployées", `Version ${current.version}${current.deployedAt ? ` du ${current.deployedAt.toLocaleDateString("fr-FR")}` : ""}.`)
        : error("Tâches déployées", `Dernier déploiement : ${current.status}${current.error ? ` (${current.error.message})` : ""}.`);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        return error(
          "Tâches déployées",
          "Aucune : ajoute TRIGGER_ACCESS_TOKEN (secret) et TRIGGER_PROJECT_REF (variable) dans GitHub, puis Actions → « Deploy Trigger.dev tasks » → Run workflow."
        );
      }
      if (status === 401 || status === 403) return error("Tâches déployées", "Trigger.dev refuse la clé TRIGGER_SECRET_KEY.");
      throw err;
    }
  });
  const projectRef = env("TRIGGER_PROJECT_REF");
  const envLabel = "Variables d'environnement Trigger.dev (Production)";
  const envVars = projectRef
    ? guarded(envLabel, async () =>
        checkTriggerEnv(await withTimeout(envvars.list(projectRef, "prod")), {
          appUrl: env("NEXT_PUBLIC_APP_URL"),
          supabaseUrl: env("NEXT_PUBLIC_SUPABASE_URL"),
          audioEnabled: Boolean(env("ELEVENLABS_API_KEY")),
        })
      )
    : Promise.resolve([warning(envLabel, "Ajoute TRIGGER_PROJECT_REF (proj_…) dans Vercel pour que cette page puisse les vérifier.")]);

  const [deployedChecks, envChecks] = await Promise.all([deployed, envVars]);
  return { ...section, checks: [checkTriggerKey(key), ...deployedChecks, ...envChecks] };
}

async function falSection(): Promise<SetupSection> {
  const key = env("FAL_KEY");
  const webhookSecret = env("AI_WEBHOOK_SECRET")
    ? ok("Secret des webhooks IA (AI_WEBHOOK_SECRET)", "Présent.")
    : error("Secret des webhooks IA (AI_WEBHOOK_SECRET)", "Absent : les résultats de fal.ai sont refusés. Mets une longue chaîne aléatoire dans Vercel et Trigger.dev.");
  if (!key) {
    return {
      id: "fal",
      title: "fal.ai : génération vidéo",
      guide: "§3",
      checks: [error("Clé fal.ai (FAL_KEY)", "Absente dans Vercel : aucune vidéo ne peut être générée."), webhookSecret],
    };
  }
  const headers = { Authorization: `Key ${key}` };
  const endpoints = Object.values(VIDEO_MODELS).map((m) => m.endpoint);

  const [prices, balance] = await Promise.all([
    guarded("Clé fal.ai (FAL_KEY)", async () => {
      const res = await fetch(`https://api.fal.ai/v1/models/pricing?endpoint_id=${endpoints.map(encodeURIComponent).join(",")}`, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) return error("Clé fal.ai (FAL_KEY)", "fal.ai refuse cette clé : recrée-la dans fal.ai → Keys.");
      if (!res.ok) throw new Error(`fal.ai a répondu ${res.status}`);
      const body = (await res.json()) as { prices?: FalPrice[] };
      return [ok("Clé fal.ai (FAL_KEY)", "Acceptée par fal.ai."), checkFalPrices(body.prices ?? [])];
    }),
    guarded("Crédit fal.ai", async () => {
      const res = await fetch("https://api.fal.ai/v1/account/billing?expand=credits", {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        return manual("Crédit fal.ai", "Illisible avec une clé standard : regarde fal.ai → Billing. Sans crédit, chaque rendu échoue (et est remboursé).");
      }
      if (!res.ok) throw new Error(`fal.ai a répondu ${res.status}`);
      const body = (await res.json()) as { credits?: { current_balance?: number; currency?: string } };
      const amount = body.credits?.current_balance;
      if (typeof amount !== "number") return manual("Crédit fal.ai", "Solde non communiqué : regarde fal.ai → Billing.");
      const text = `${amount.toFixed(2)} ${body.credits?.currency ?? "USD"} restants.`;
      if (amount <= 0) return error("Crédit fal.ai", `${text} Recharge : chaque rendu échoue tant que le solde est vide.`);
      return amount < 10 ? warning("Crédit fal.ai", `${text} Pense à recharger.`) : ok("Crédit fal.ai", text);
    }),
  ]);
  return { id: "fal", title: "fal.ai : génération vidéo", guide: "§3", checks: [...prices, ...balance, webhookSecret] };
}

async function stripeSection(appOrigin: string | null): Promise<SetupSection> {
  const key = env("STRIPE_SECRET_KEY");
  const section = { id: "stripe", title: "Stripe : paiements", guide: "§5" };
  if (!key) return { ...section, checks: [error("Clé Stripe (STRIPE_SECRET_KEY)", "Absente dans Vercel : personne ne peut payer.")] };

  const stripe = getStripe();
  const opts = { timeout: TIMEOUT_MS, maxNetworkRetries: 0 };
  const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  const checks: SetupCheck[] = [
    live
      ? ok("Clé Stripe (STRIPE_SECRET_KEY)", "Mode live : les vrais paiements sont encaissés.")
      : warning("Clé Stripe (STRIPE_SECRET_KEY)", "Mode test : parfait pour essayer, mais les vrais clients ne peuvent pas payer. Passe aux clés live une fois tout testé."),
  ];

  // All calls at once: a slow Stripe costs one timeout, not one per call.
  const prices = Promise.all(
    STRIPE_CATALOG.map((entry) =>
      guarded(entry.name, async () => {
        const priceId = env(entry.envVar);
        if (!priceId) return checkStripePrice(entry, null, null);
        try {
          return checkStripePrice(entry, priceId, await stripe.prices.retrieve(priceId, {}, opts));
        } catch (err) {
          if ((err as { statusCode?: number }).statusCode === 404) return checkStripePrice(entry, priceId, null);
          throw err;
        }
      })
    )
  );
  const webhook = guarded("Webhook Stripe", async () => {
    const { data } = await stripe.webhookEndpoints.list({ limit: 100 }, opts);
    return checkStripeWebhook(data, appOrigin);
  });
  const webhookSecret = env("STRIPE_WEBHOOK_SECRET")
    ? ok("Secret du webhook (STRIPE_WEBHOOK_SECRET)", "Présent.")
    : error("Secret du webhook (STRIPE_WEBHOOK_SECRET)", "Absent : chaque événement Stripe est refusé, aucun paiement n'est crédité.");
  const portal = guarded("Portail client", async () => {
    const { data } = await stripe.billingPortal.configurations.list({ is_default: true, active: true, limit: 1 }, opts);
    const config = data[0];
    if (!config) return error("Portail client", "Pas configuré : « Manage subscription » ne s'ouvrira pas. Stripe → Settings → Billing → Customer portal → Save.");
    const cancel = config.features.subscription_cancel;
    if (!cancel.enabled) return warning("Portail client", "Les clients ne peuvent pas résilier eux-mêmes (obligatoire en France).");
    if (cancel.mode !== "at_period_end") return warning("Portail client", "La résiliation est immédiate, alors que les CGU annoncent une résiliation en fin de période.");
    return ok("Portail client", "Actif, résiliation en fin de période.");
  });
  const tax =
    process.env.STRIPE_AUTOMATIC_TAX === "true"
      ? guarded("Stripe Tax", async () => {
          const settings = await stripe.tax.settings.retrieve({}, opts);
          return settings.status === "active"
            ? ok("Stripe Tax", "Actif.")
            : error("Stripe Tax", "STRIPE_AUTOMATIC_TAX = true mais Stripe Tax n'est pas activé : chaque paiement échoue. Termine son activation ou retire la variable.");
        })
      : Promise.resolve([]);

  const [priceChecks, webhookChecks, portalChecks, taxChecks] = await Promise.all([prices, webhook, portal, tax]);
  checks.push(...priceChecks.flat(), ...webhookChecks, webhookSecret, ...portalChecks, ...taxChecks);
  return { ...section, checks };
}

async function abuseSection(): Promise<SetupSection> {
  const url = env("UPSTASH_REDIS_REST_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN");
  const label = "Limitation des requêtes (Upstash)";
  const checks =
    url && token
      ? await guarded(label, async () => {
          const pong = await withTimeout(new Redis({ url, token, retry: false }).ping());
          return pong === "PONG" ? ok(label, "Active.") : warning(label, `Réponse inattendue : ${pong}`);
        })
      : [error(label, "Pas configurée : n'importe qui peut lancer des rendus ou des requêtes sans limite. Ajoute UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN.")];
  checks.push(
    env("ELEVENLABS_API_KEY")
      ? ok("Son IA (ElevenLabs, optionnel)", "Clé présente.")
      : ok("Son IA (ElevenLabs, optionnel)", "Désactivé : l'option « Add AI sound » est masquée.")
  );
  return { id: "abuse", title: "Protection et options", guide: "§6, §7", checks };
}

function legalSection(): SetupSection {
  const fields: [string, string][] = [
    ["NEXT_PUBLIC_SUPPORT_EMAIL", "E-mail de contact"],
    ["NEXT_PUBLIC_LEGAL_NAME", "Éditeur (nom ou société)"],
    ["NEXT_PUBLIC_LEGAL_FORM", "Forme juridique"],
    ["NEXT_PUBLIC_LEGAL_ADDRESS", "Adresse postale"],
    ["NEXT_PUBLIC_LEGAL_SIRET", "SIRET"],
    ["NEXT_PUBLIC_LEGAL_DIRECTOR", "Directeur de la publication"],
    ["NEXT_PUBLIC_LEGAL_MEDIATOR", "Médiateur de la consommation"],
  ];
  const missing = fields.filter(([name]) => !env(name));
  const checks: SetupCheck[] = [
    missing.length
      ? error("Mentions légales", `Manquent dans Vercel : ${missing.map(([name, label]) => `${label} (${name})`).join(", ")}.`)
      : ok("Mentions légales", "Toutes les informations obligatoires sont renseignées."),
    manual("Relecture juridique", "Les CGU et la politique de confidentialité sont à faire relire par un professionnel avant de vendre."),
  ];
  return { id: "legal", title: "Informations légales", guide: "§8", checks };
}

export async function runSetupChecks({ requestOrigin }: { requestOrigin: string | null }): Promise<SetupSection[]> {
  let appOrigin: string | null = null;
  try {
    appOrigin = env("NEXT_PUBLIC_APP_URL") ? new URL(env("NEXT_PUBLIC_APP_URL")!).origin : null;
  } catch {
    appOrigin = null;
  }
  return Promise.all([
    siteSection(requestOrigin),
    databaseSection(),
    authSection(),
    falSection(),
    triggerSection(),
    stripeSection(appOrigin),
    abuseSection(),
    Promise.resolve(legalSection()),
  ]);
}
