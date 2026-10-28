import type Stripe from "stripe";
import { STRIPE_API_VERSION } from "@/lib/stripe/server";
import { priceProblems, STRIPE_CATALOG, STRIPE_WEBHOOK_EVENTS, STRIPE_WEBHOOK_PATH, type CatalogEntry } from "@/lib/stripe/catalog";

export type StripeSetupResult = {
  prices: { envVar: string; name: string; priceId: string; created: boolean }[];
  webhook: {
    url: string;
    created: boolean;
    /** Events added to, or re-enabled on, an endpoint that already existed. */
    updated: boolean;
    /** Only Stripe's response to creating the endpoint carries it. */
    secret: string | null;
  };
};

function isNotFound(err: unknown) {
  return (err as { statusCode?: number }).statusCode === 404;
}

/**
 * The price for one catalog entry: the one already configured if it's
 * right, else one carrying the entry's lookup key (left by an earlier run),
 * else a new product + price. Running this twice creates nothing twice.
 */
async function ensurePrice(stripe: Stripe, entry: CatalogEntry) {
  const configured = process.env[entry.envVar]?.trim();
  if (configured) {
    try {
      const price = await stripe.prices.retrieve(configured);
      if (priceProblems(entry, price).length === 0) return { priceId: price.id, created: false };
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  const { data } = await stripe.prices.list({ lookup_keys: [entry.lookupKey], active: true, limit: 1 });
  if (data[0] && priceProblems(entry, data[0]).length === 0) return { priceId: data[0].id, created: false };

  const price = await stripe.prices.create(
    {
      currency: "usd",
      unit_amount: entry.amount,
      ...(entry.recurring ? { recurring: { interval: "month" as const } } : {}),
      product_data: { name: entry.name },
      lookup_key: entry.lookupKey,
      // A stale price holding the key (e.g. after a price change) hands it over.
      transfer_lookup_key: true,
    },
    // A double click within 24 h gets the same price back instead of a second one.
    { idempotencyKey: `komamotion-setup-${entry.lookupKey}-${entry.amount}` }
  );
  return { priceId: price.id, created: true };
}

async function ensureWebhook(stripe: Stripe, appOrigin: string): Promise<StripeSetupResult["webhook"]> {
  const url = `${appOrigin}${STRIPE_WEBHOOK_PATH}`;
  const { data } = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = data.find((e) => e.url === url);

  if (existing) {
    const wildcard = existing.enabled_events.includes("*");
    const missing = wildcard ? [] : STRIPE_WEBHOOK_EVENTS.filter((e) => !existing.enabled_events.includes(e));
    if (missing.length === 0 && existing.status === "enabled") return { url, created: false, updated: false, secret: null };
    await stripe.webhookEndpoints.update(existing.id, {
      disabled: false,
      ...(wildcard
        ? {}
        : { enabled_events: [...existing.enabled_events, ...missing] as Stripe.WebhookEndpointUpdateParams.EnabledEvent[] }),
    });
    return { url, created: false, updated: true, secret: null };
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: [...STRIPE_WEBHOOK_EVENTS],
    api_version: STRIPE_API_VERSION,
    description: "KomaMotion AI (created from /admin/setup)",
  });
  return { url, created: true, updated: false, secret: endpoint.secret ?? null };
}

/**
 * Creates whatever Stripe is missing for the site to take payments: the
 * three monthly plans, the credit pack and the webhook endpoint. Returns
 * the ids to put in Vercel (the app reads price ids from env vars).
 */
export async function ensureStripeCatalog(stripe: Stripe, appOrigin: string): Promise<StripeSetupResult> {
  const prices = [];
  for (const entry of STRIPE_CATALOG) {
    prices.push({ envVar: entry.envVar, name: entry.name, ...(await ensurePrice(stripe, entry)) });
  }
  return { prices, webhook: await ensureWebhook(stripe, appOrigin) };
}
