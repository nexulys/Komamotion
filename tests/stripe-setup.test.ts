import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { ensureStripeCatalog } from "@/lib/stripe/setup";
import { STRIPE_CATALOG, STRIPE_WEBHOOK_EVENTS } from "@/lib/stripe/catalog";

const APP = "https://komamotion.vercel.app";
const WEBHOOK_URL = `${APP}/api/webhooks/stripe`;

type FakePrice = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number;
  type: "recurring" | "one_time";
  recurring: { interval: string; interval_count: number } | null;
  lookup_key: string | null;
};
type FakeEndpoint = { id: string; url: string; status: string; enabled_events: string[] };

/** In-memory Stripe with just the calls the setup makes. */
function fakeStripe() {
  const prices: FakePrice[] = [];
  const endpoints: FakeEndpoint[] = [];
  const calls: string[] = [];
  const idempotency = new Map<string, FakePrice>();
  const stripe = {
    prices: {
      retrieve: async (id: string) => {
        calls.push(`retrieve ${id}`);
        const price = prices.find((p) => p.id === id);
        if (!price) throw Object.assign(new Error("No such price"), { statusCode: 404 });
        return price;
      },
      list: async ({ lookup_keys }: { lookup_keys: string[] }) => ({
        data: prices.filter((p) => p.active && p.lookup_key && lookup_keys.includes(p.lookup_key)),
      }),
      create: async (
        params: { unit_amount: number; recurring?: { interval: string }; lookup_key: string; transfer_lookup_key: boolean },
        opts: { idempotencyKey: string }
      ) => {
        const replay = idempotency.get(opts.idempotencyKey);
        if (replay) return replay;
        calls.push(`create ${params.lookup_key}`);
        if (params.transfer_lookup_key) for (const p of prices) if (p.lookup_key === params.lookup_key) p.lookup_key = null;
        const price: FakePrice = {
          id: `price_${prices.length + 1}`,
          active: true,
          currency: "usd",
          unit_amount: params.unit_amount,
          type: params.recurring ? "recurring" : "one_time",
          recurring: params.recurring ? { interval: params.recurring.interval, interval_count: 1 } : null,
          lookup_key: params.lookup_key,
        };
        prices.push(price);
        idempotency.set(opts.idempotencyKey, price);
        return price;
      },
    },
    webhookEndpoints: {
      list: async () => ({ data: endpoints }),
      create: async (params: { url: string; enabled_events: string[]; api_version: string }) => {
        calls.push(`create webhook ${params.api_version}`);
        const endpoint = { id: "we_1", url: params.url, status: "enabled", enabled_events: params.enabled_events };
        endpoints.push(endpoint);
        return { ...endpoint, secret: "whsec_new" };
      },
      update: async (id: string, params: { disabled: boolean; enabled_events?: string[] }) => {
        calls.push(`update webhook ${id}`);
        const endpoint = endpoints.find((e) => e.id === id)!;
        endpoint.status = params.disabled ? "disabled" : "enabled";
        if (params.enabled_events) endpoint.enabled_events = params.enabled_events;
        return endpoint;
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, prices, endpoints, calls };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const entry of STRIPE_CATALOG) vi.stubEnv(entry.envVar, "");
});

describe("ensureStripeCatalog", () => {
  it("creates the four prices and the webhook on an empty account", async () => {
    const f = fakeStripe();
    const result = await ensureStripeCatalog(f.stripe, APP);
    expect(result.prices.map((p) => [p.envVar, p.created])).toEqual(STRIPE_CATALOG.map((e) => [e.envVar, true]));
    expect(f.prices.map((p) => [p.unit_amount, p.type])).toEqual([
      [1900, "recurring"],
      [4900, "recurring"],
      [14900, "recurring"],
      [1500, "one_time"],
    ]);
    expect(result.webhook).toEqual({ url: WEBHOOK_URL, created: true, updated: false, secret: "whsec_new" });
    expect(f.endpoints[0].enabled_events).toEqual([...STRIPE_WEBHOOK_EVENTS]);
    expect(f.calls).toContain("create webhook 2026-08-26.dahlia");
  });

  it("running it again creates nothing", async () => {
    const f = fakeStripe();
    const first = await ensureStripeCatalog(f.stripe, APP);
    f.calls.length = 0;
    const second = await ensureStripeCatalog(f.stripe, APP);
    expect(second.prices.map((p) => p.priceId)).toEqual(first.prices.map((p) => p.priceId));
    expect(second.prices.every((p) => !p.created)).toBe(true);
    expect(second.webhook).toEqual({ url: WEBHOOK_URL, created: false, updated: false, secret: null });
    expect(f.calls.filter((c) => c.startsWith("create"))).toEqual([]);
  });

  it("keeps a correct price already set in Vercel, replaces a wrong one", async () => {
    const f = fakeStripe();
    f.prices.push(
      { id: "price_mine", active: true, currency: "usd", unit_amount: 1900, type: "recurring", recurring: { interval: "month", interval_count: 1 }, lookup_key: null },
      { id: "price_wrong", active: true, currency: "usd", unit_amount: 3900, type: "recurring", recurring: { interval: "month", interval_count: 1 }, lookup_key: null }
    );
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_mine");
    vi.stubEnv("STRIPE_PRICE_STUDIO", "price_wrong");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_deleted");
    const result = await ensureStripeCatalog(f.stripe, APP);
    expect(result.prices[0]).toMatchObject({ priceId: "price_mine", created: false });
    expect(result.prices[1]).toMatchObject({ created: true });
    expect(result.prices[1].priceId).not.toBe("price_wrong");
    expect(result.prices[2]).toMatchObject({ created: true });
  });

  it("completes the events of an existing webhook and re-enables it", async () => {
    const f = fakeStripe();
    f.endpoints.push({ id: "we_old", url: WEBHOOK_URL, status: "disabled", enabled_events: ["checkout.session.completed", "charge.refunded"] });
    const result = await ensureStripeCatalog(f.stripe, APP);
    expect(result.webhook).toEqual({ url: WEBHOOK_URL, created: false, updated: true, secret: null });
    expect(f.endpoints[0].status).toBe("enabled");
    expect(f.endpoints[0].enabled_events).toEqual(["checkout.session.completed", "charge.refunded", ...STRIPE_WEBHOOK_EVENTS.slice(1)]);
  });
});
