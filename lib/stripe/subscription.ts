import type Stripe from "stripe";
import { getPlanByPriceId } from "@/lib/stripe/plans";
import type { PlanId } from "@/lib/supabase/types";

/**
 * Subscription statuses that keep paid features. past_due stays entitled
 * while Stripe retries the card (its dunning settings end in canceled or
 * unpaid, which then downgrade); everything else falls back to free.
 */
const ENTITLED_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set(["active", "trialing", "past_due"]);

export function isEntitledStatus(status: string | null | undefined) {
  return status != null && ENTITLED_STATUSES.has(status as Stripe.Subscription.Status);
}

/**
 * The plan a user should be on for a subscription in this state, or null
 * to leave it unchanged (entitled, but the price isn't one of our plans).
 */
export function planForSubscription(status: string, priceId: string | null | undefined): PlanId | null {
  if (!isEntitledStatus(status)) return "free";
  return getPlanByPriceId(priceId)?.id ?? null;
}
