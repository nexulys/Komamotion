import type Stripe from "stripe";
import { CREDIT_PACK, PLANS } from "@/lib/stripe/plans";

/** Where Stripe sends events, relative to the site's origin. */
export const STRIPE_WEBHOOK_PATH = "/api/webhooks/stripe";

/** Every event app/api/webhooks/stripe/route.ts acts on. */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
] as const;

export type CatalogEntry = {
  /** Env var holding the Stripe price id. */
  envVar: string;
  /** Stripe lookup key, so creating the catalog twice reuses the same prices. */
  lookupKey: string;
  name: string;
  /** In cents, USD. */
  amount: number;
  /** Monthly subscription, or a one-time payment. */
  recurring: boolean;
};

/** What Stripe must sell, as the plans in lib/stripe/plans.ts describe it. */
export const STRIPE_CATALOG: CatalogEntry[] = [
  ...PLANS.map((plan) => ({
    envVar: `STRIPE_PRICE_${plan.id.toUpperCase()}`,
    lookupKey: `komamotion_${plan.id}_monthly`,
    name: `KomaMotion ${plan.name}`,
    amount: plan.price * 100,
    recurring: true,
  })),
  {
    envVar: "STRIPE_PRICE_CREDIT_PACK",
    lookupKey: "komamotion_credit_pack",
    name: `KomaMotion credit pack (${CREDIT_PACK.credits} credits)`,
    amount: CREDIT_PACK.price * 100,
    recurring: false,
  },
];

export type PriceLike = Pick<Stripe.Price, "active" | "currency" | "unit_amount" | "type"> & {
  recurring: { interval: string; interval_count: number } | null;
};

/** How a Stripe price differs from what the entry sells (French, shown in /admin/setup); empty when it matches. */
export function priceProblems(entry: CatalogEntry, price: PriceLike): string[] {
  const problems: string[] = [];
  if (!price.active) problems.push("prix archivé");
  if (price.currency !== "usd") problems.push(`devise ${price.currency.toUpperCase()} au lieu de USD`);
  if (price.unit_amount !== entry.amount) {
    problems.push(`montant ${(price.unit_amount ?? 0) / 100} au lieu de ${entry.amount / 100}`);
  }
  if (entry.recurring) {
    if (price.type !== "recurring" || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) {
      problems.push("doit être un abonnement mensuel");
    }
  } else if (price.type !== "one_time") {
    problems.push("doit être un paiement unique");
  }
  return problems;
}
