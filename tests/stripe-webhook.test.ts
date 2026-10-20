import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, createFakeDb, type FakeDb } from "./helpers/fake-postgrest";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  client: null as unknown,
  event: null as unknown,
  subscription: null as unknown,
}));

vi.hoisted(() => {
  process.env.STRIPE_PRICE_STARTER = "price_starter_test";
  process.env.STRIPE_PRICE_STUDIO = "price_studio_test";
  process.env.STRIPE_PRICE_PRO = "price_pro_test";
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => h.client,
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: () => h.event },
    subscriptions: { retrieve: async () => h.subscription },
  }),
}));

import { POST } from "@/app/api/webhooks/stripe/route";
import { planForSubscription } from "@/lib/stripe/subscription";

function seed(user: Record<string, unknown> = {}) {
  h.db = createFakeDb();
  h.db.unique = { credit_transactions: ["stripe_event_id"] };
  h.client = createFakeClient(h.db);
  h.db.tables = {
    users: [{ id: "u1", plan: "studio", credits_balance: 10, stripe_subscription_id: "sub_1", stripe_subscription_status: "active", ...user }],
    credit_transactions: [],
  };
}
const user = () => h.db.tables.users[0];
const subscription = (status: string, id = "sub_1", price = "price_studio_test") => ({
  id,
  status,
  metadata: { supabase_user_id: "u1" },
  items: { data: [{ price: { id: price } }] },
});
async function deliver(event: Record<string, unknown>) {
  h.event = { id: "evt_1", ...event };
  const res = await POST(new Request("http://test/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "t" } }));
  expect(res.status).toBe(200);
}

beforeEach(() => seed());

describe("planForSubscription", () => {
  it("keeps paid plans while entitled and drops to free otherwise", () => {
    expect(planForSubscription("active", "price_pro_test")).toBe("pro");
    expect(planForSubscription("trialing", "price_starter_test")).toBe("starter");
    expect(planForSubscription("past_due", "price_studio_test")).toBe("studio");
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      expect(planForSubscription(status, "price_pro_test")).toBe("free");
    }
    expect(planForSubscription("active", "price_unknown")).toBeNull();
  });
});

describe("Stripe webhook", () => {
  it("cancelling the current subscription drops the user to free", async () => {
    await deliver({ type: "customer.subscription.deleted", data: { object: subscription("canceled") } });
    expect([user().plan, user().stripe_subscription_status]).toEqual(["free", "canceled"]);
  });

  it("a stale subscription ending doesn't downgrade the user", async () => {
    await deliver({ type: "customer.subscription.deleted", data: { object: subscription("canceled", "sub_old") } });
    expect(user().plan).toBe("studio");
  });

  it("an unpaid subscription drops to free; past_due keeps the plan", async () => {
    await deliver({ type: "customer.subscription.updated", data: { object: subscription("past_due") } });
    expect(user().plan).toBe("studio");
    await deliver({ type: "customer.subscription.updated", data: { object: subscription("unpaid") } });
    expect([user().plan, user().stripe_subscription_status]).toEqual(["free", "unpaid"]);
  });

  it("an upgrade switches the plan", async () => {
    await deliver({ type: "customer.subscription.updated", data: { object: subscription("active", "sub_1", "price_pro_test") } });
    expect(user().plan).toBe("pro");
  });

  it("grants monthly credits once per invoice, even if Stripe redelivers", async () => {
    h.subscription = subscription("active");
    const invoice = { amount_paid: 4900, parent: { subscription_details: { subscription: "sub_1" } } };
    await deliver({ id: "evt_inv", type: "invoice.payment_succeeded", data: { object: invoice } });
    await deliver({ id: "evt_inv", type: "invoice.payment_succeeded", data: { object: invoice } });
    expect(user().credits_balance).toBe(10 + 2000);
    expect(h.db.tables.credit_transactions).toHaveLength(1);
  });

  it("a $0 invoice grants nothing", async () => {
    h.subscription = subscription("active");
    await deliver({
      type: "invoice.payment_succeeded",
      data: { object: { amount_paid: 0, parent: { subscription_details: { subscription: "sub_1" } } } },
    });
    expect(user().credits_balance).toBe(10);
  });

  it("a credit pack purchase adds its credits", async () => {
    await deliver({
      type: "checkout.session.completed",
      data: { object: { metadata: { supabase_user_id: "u1", credit_pack: "true", credits: "500" }, subscription: null } },
    });
    expect(user().credits_balance).toBe(510);
  });
});
