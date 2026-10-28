import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  deployment: null as null | { status: string; version: string; deployedAt?: Date } | { error: { status: number } },
  triggerEnv: [] as { name: string; value: string; isSecret?: boolean }[],
  episodesError: null as null | { code: string; message: string },
  prices: {} as Record<string, unknown>,
  webhooks: [] as unknown[],
  fetches: [] as string[],
}));

vi.mock("@trigger.dev/sdk", () => ({
  deployments: {
    retrieveCurrent: async () => {
      if (h.deployment && "error" in h.deployment) throw Object.assign(new Error("api error"), h.deployment.error);
      return h.deployment;
    },
  },
  envvars: { list: async () => h.triggerEnv },
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    ping() {
      return Promise.resolve("PONG");
    }
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => {
    const query = (table: string) => {
      const result = table === "episodes" && h.episodesError ? { error: h.episodesError } : { count: 3, error: null };
      const q = { select: () => q, limit: () => q, abortSignal: () => Promise.resolve(result) };
      return q;
    };
    return { from: query, storage: { getBucket: async () => ({ data: { public: false }, error: null }) } };
  },
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    prices: {
      retrieve: async (id: string) => {
        if (!(id in h.prices)) throw Object.assign(new Error("No such price"), { statusCode: 404 });
        return h.prices[id];
      },
    },
    webhookEndpoints: { list: async () => ({ data: h.webhooks }) },
    billingPortal: {
      configurations: {
        list: async () => ({ data: [{ features: { subscription_cancel: { enabled: true, mode: "at_period_end" } } }] }),
      },
    },
    tax: { settings: { retrieve: async () => ({ status: "active" }) } },
  }),
}));

import {
  checkAppUrl,
  checkCaptcha,
  checkFalPrices,
  checkGoogle,
  checkStripePrice,
  checkStripeWebhook,
  checkTriggerEnv,
  checkTriggerKey,
  runSetupChecks,
  type SetupSection,
} from "@/lib/admin/setup-checks";
import { STRIPE_CATALOG, STRIPE_WEBHOOK_EVENTS } from "@/lib/stripe/catalog";

const APP = "https://komamotion.vercel.app";
const SUPABASE = "https://abc.supabase.co";

const monthly = (amount: number) => ({
  active: true,
  currency: "usd",
  unit_amount: amount,
  type: "recurring" as const,
  recurring: { interval: "month", interval_count: 1 },
});
const starter = STRIPE_CATALOG[0];
const pack = STRIPE_CATALOG[STRIPE_CATALOG.length - 1];

describe("evaluations", () => {
  it("app URL", () => {
    expect(checkAppUrl(null, null).status).toBe("error");
    expect(checkAppUrl("http://komamotion.vercel.app", null).status).toBe("error");
    expect(checkAppUrl(`${APP}/`, null).status).toBe("warning");
    expect(checkAppUrl(APP, "https://komamotion.com").status).toBe("warning");
    expect(checkAppUrl(APP, APP)).toMatchObject({ status: "ok", detail: APP });
  });

  it("Trigger.dev key must be the production one", () => {
    expect(checkTriggerKey(null).status).toBe("error");
    expect(checkTriggerKey("tr_dev_abc").status).toBe("error");
    expect(checkTriggerKey("tr_prod_abc").status).toBe("ok");
  });

  it("captcha: a Supabase requirement without the widget locks everyone out", () => {
    expect(checkCaptcha(true, false).status).toBe("error");
    expect(checkCaptcha(false, true).status).toBe("warning");
    expect(checkCaptcha(false, false).status).toBe("warning");
    expect(checkCaptcha(true, true).status).toBe("ok");
  });

  it("Google button only when the provider is on", () => {
    expect(checkGoogle(false, true).status).toBe("error");
    expect(checkGoogle(true, false).status).toBe("warning");
    expect(checkGoogle(false, false).status).toBe("ok");
  });

  it("Stripe prices must match the plans", () => {
    expect(checkStripePrice(starter, null, null).status).toBe("error");
    expect(checkStripePrice(starter, "price_x", null).detail).toMatch(/n'existe pas/);
    expect(checkStripePrice(starter, "price_x", monthly(starter.amount)).status).toBe("ok");
    expect(checkStripePrice(starter, "price_x", { ...monthly(1500), currency: "eur" }).detail).toMatch(/devise EUR.*montant 15 au lieu de 19/);
    expect(checkStripePrice(starter, "price_x", { ...monthly(starter.amount), recurring: { interval: "year", interval_count: 1 } }).detail).toMatch(
      /abonnement mensuel/
    );
    expect(checkStripePrice(pack, "price_x", monthly(pack.amount)).detail).toMatch(/paiement unique/);
    expect(checkStripePrice(pack, "price_x", { ...monthly(pack.amount), type: "one_time", recurring: null }).status).toBe("ok");
  });

  it("Stripe webhook must point at the site with every event", () => {
    const url = `${APP}/api/webhooks/stripe`;
    const all = [...STRIPE_WEBHOOK_EVENTS];
    expect(checkStripeWebhook([], APP).status).toBe("error");
    expect(checkStripeWebhook([{ url, status: "disabled", enabled_events: all }], APP).detail).toMatch(/désactivé/);
    expect(checkStripeWebhook([{ url, status: "enabled", enabled_events: all.slice(1) }], APP).detail).toMatch(
      /manquants : checkout.session.completed/
    );
    expect(checkStripeWebhook([{ url, status: "enabled", enabled_events: ["*"] }], APP).status).toBe("ok");
    expect(checkStripeWebhook([{ url: "https://old.app/api/webhooks/stripe", status: "enabled", enabled_events: all }], APP).status).toBe("error");
  });

  it("Trigger.dev needs its own copy of the variables, matching Vercel", () => {
    const vars = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_APP_URL", "AI_WEBHOOK_SECRET", "FAL_KEY"].map((name) => ({
      name,
      value: name === "NEXT_PUBLIC_APP_URL" ? APP : name === "NEXT_PUBLIC_SUPABASE_URL" ? SUPABASE : "redacted",
      isSecret: !name.startsWith("NEXT_PUBLIC_"),
    }));
    const vercel = { appUrl: APP, supabaseUrl: SUPABASE, audioEnabled: false };
    expect(checkTriggerEnv(vars, vercel).status).toBe("ok");
    expect(checkTriggerEnv(vars.slice(1), vercel).detail).toMatch(/Manquantes : NEXT_PUBLIC_SUPABASE_URL/);
    expect(checkTriggerEnv(vars, { ...vercel, audioEnabled: true }).detail).toMatch(/ELEVENLABS_API_KEY/);
    expect(checkTriggerEnv(vars, { ...vercel, appUrl: "https://komamotion.com" }).detail).toMatch(/Différentes de Vercel : NEXT_PUBLIC_APP_URL/);
  });

  it("warns when the default model costs more than the pricing assumes", () => {
    const price = (unit_price: number) => [
      { endpoint_id: "fal-ai/ltx-2.3/image-to-video/fast", unit_price, unit: "second", currency: "USD" },
    ];
    expect(checkFalPrices(price(0.04)).status).toBe("ok");
    expect(checkFalPrices(price(0.06)).status).toBe("warning");
  });
});

// ---- the whole page ------------------------------------------------------------

const statusOf = (sections: SetupSection[], label: string) =>
  sections.flatMap((s) => s.checks).find((c) => c.label.startsWith(label))?.status;

const ALL_ENV: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: APP,
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAA",
  TRIGGER_SECRET_KEY: "tr_prod_abc",
  TRIGGER_PROJECT_REF: "proj_abc",
  FAL_KEY: "id:secret",
  AI_WEBHOOK_SECRET: "webhook-secret",
  STRIPE_SECRET_KEY: "sk_live_abc",
  STRIPE_WEBHOOK_SECRET: "whsec_abc",
  STRIPE_PRICE_STARTER: "price_starter_real",
  STRIPE_PRICE_STUDIO: "price_studio_real",
  STRIPE_PRICE_PRO: "price_pro_real",
  STRIPE_PRICE_CREDIT_PACK: "price_pack_real",
  UPSTASH_REDIS_REST_URL: "https://redis.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@komamotion.com",
  NEXT_PUBLIC_LEGAL_NAME: "Nexulys",
  NEXT_PUBLIC_LEGAL_FORM: "EI",
  NEXT_PUBLIC_LEGAL_ADDRESS: "1 rue X",
  NEXT_PUBLIC_LEGAL_SIRET: "123",
  NEXT_PUBLIC_LEGAL_DIRECTOR: "Nexulys",
  NEXT_PUBLIC_LEGAL_MEDIATOR: "Médiateur X",
};

function stubFetch(captchaRequired: boolean) {
  vi.stubGlobal("fetch", async (input: string) => {
    h.fetches.push(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (input === `${SUPABASE}/auth/v1/settings`) return json({ disable_signup: false, mailer_autoconfirm: false, external: { google: false } });
    if (input.startsWith(`${SUPABASE}/auth/v1/token`)) {
      return captchaRequired
        ? json({ code: 500, msg: "captcha verification process failed" }, 500)
        : json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
    }
    if (input.startsWith("https://api.fal.ai/v1/models/pricing")) {
      return json({ prices: [{ endpoint_id: "fal-ai/ltx-2.3/image-to-video/fast", unit_price: 0.04, unit: "second", currency: "USD" }] });
    }
    if (input.startsWith("https://api.fal.ai/v1/account/billing")) return json({ credits: { current_balance: 42.5, currency: "USD" } });
    throw new Error(`unexpected fetch ${input}`);
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  h.fetches = [];
  h.deployment = { status: "DEPLOYED", version: "20261028.1", deployedAt: new Date("2026-10-28T10:00:00Z") };
  h.episodesError = null;
  h.triggerEnv = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_APP_URL", "AI_WEBHOOK_SECRET", "FAL_KEY"].map((name) => ({
    name,
    value: name === "NEXT_PUBLIC_APP_URL" ? APP : name === "NEXT_PUBLIC_SUPABASE_URL" ? SUPABASE : "redacted",
    isSecret: !name.startsWith("NEXT_PUBLIC_"),
  }));
  h.prices = {
    price_starter_real: monthly(1900),
    price_studio_real: monthly(4900),
    price_pro_real: monthly(14900),
    price_pack_real: { ...monthly(1500), type: "one_time", recurring: null },
  };
  h.webhooks = [{ url: `${APP}/api/webhooks/stripe`, status: "enabled", enabled_events: [...STRIPE_WEBHOOK_EVENTS] }];
});

describe("runSetupChecks", () => {
  it("everything configured: nothing blocking", async () => {
    for (const [name, value] of Object.entries(ALL_ENV)) vi.stubEnv(name, value);
    stubFetch(true);
    const sections = await runSetupChecks({ requestOrigin: APP });
    const blocking = sections.flatMap((s) => s.checks).filter((c) => c.status === "error" || c.status === "warning");
    expect(blocking).toEqual([]);
    expect(statusOf(sections, "Tâches déployées")).toBe("ok");
    expect(statusOf(sections, "Crédit fal.ai")).toBe("ok");
    expect(statusOf(sections, "Captcha")).toBe("ok");
  });

  it("names what's missing", async () => {
    for (const [name, value] of Object.entries(ALL_ENV)) vi.stubEnv(name, value);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    h.deployment = { error: { status: 404 } };
    h.episodesError = { code: "PGRST205", message: "Could not find the table 'public.episodes'" };
    stubFetch(true);
    const sections = await runSetupChecks({ requestOrigin: APP });
    expect(statusOf(sections, "Captcha")).toBe("error");
    expect(statusOf(sections, "Tâches déployées")).toBe("error");
    expect(statusOf(sections, "Migration 0006")).toBe("error");
    expect(statusOf(sections, "Migration 0005")).toBe("ok");
    expect(statusOf(sections, "Secret du webhook")).toBe("error");
  });

  it("nothing configured: every section still renders, without calling out", async () => {
    for (const name of Object.keys(ALL_ENV)) vi.stubEnv(name, "");
    stubFetch(false);
    const sections = await runSetupChecks({ requestOrigin: APP });
    expect(sections.map((s) => s.id)).toEqual(["site", "database", "auth", "fal", "trigger", "stripe", "abuse", "legal"]);
    expect(h.fetches).toEqual([]);
    for (const label of ["Adresse du site", "Connexion à la base", "Clé Trigger.dev", "Clé fal.ai", "Clé Stripe", "Limitation des requêtes", "Mentions légales"]) {
      expect(statusOf(sections, label)).toBe("error");
    }
  });
});
