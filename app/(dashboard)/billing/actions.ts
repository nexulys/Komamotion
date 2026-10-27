"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { getPlanById, CREDIT_PACK } from "@/lib/stripe/plans";
import { isEntitledStatus } from "@/lib/stripe/subscription";
import { requireCurrentUser } from "@/lib/supabase/queries";

export type BillingActionResult = { error: string } | undefined;

const PAYMENTS_UNAVAILABLE = "Payments aren't available right now. Please try again later.";

async function getOrigin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_APP_URL || h.get("origin") || `https://${h.get("host")}`;
}

/**
 * Stripe Tax only works once it's activated in the Stripe dashboard, so it
 * stays off unless STRIPE_AUTOMATIC_TAX=true. It needs the customer's
 * address, which Checkout collects and saves back onto the customer.
 */
function taxOptions(): Pick<Stripe.Checkout.SessionCreateParams, "automatic_tax" | "customer_update" | "billing_address_collection"> {
  if (process.env.STRIPE_AUTOMATIC_TAX !== "true") return {};
  return {
    automatic_tax: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    billing_address_collection: "required",
  };
}

async function portalUrl(customerId: string) {
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${await getOrigin()}/billing`,
  });
  return session.url;
}

export async function createCheckoutSession(planId: string): Promise<BillingActionResult> {
  const { authUserId, email, profile } = await requireCurrentUser();
  const plan = getPlanById(planId);
  if (!plan || !plan.stripePriceId) return { error: "This plan can't be purchased." };

  let url: string | null;
  try {
    const customerId = await getOrCreateStripeCustomer({ userId: authUserId, email });

    // Already subscribed: switching plans happens in the billing portal, so
    // the user never ends up paying for two subscriptions at once.
    if (profile?.stripe_subscription_id && isEntitledStatus(profile.stripe_subscription_status)) {
      url = await portalUrl(customerId);
    } else {
      const origin = await getOrigin();
      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        success_url: `${origin}/billing?checkout=success`,
        cancel_url: `${origin}/billing?checkout=cancelled`,
        metadata: { supabase_user_id: authUserId, plan_id: plan.id },
        subscription_data: {
          metadata: { supabase_user_id: authUserId, plan_id: plan.id },
        },
        ...taxOptions(),
      });
      url = session.url;
    }
  } catch (err) {
    console.error("[billing] checkout failed", err);
    return { error: PAYMENTS_UNAVAILABLE };
  }

  if (!url) return { error: PAYMENTS_UNAVAILABLE };
  redirect(url);
}

export async function createCreditPackCheckout(): Promise<BillingActionResult> {
  const { authUserId, email } = await requireCurrentUser();

  let url: string | null;
  try {
    const customerId = await getOrCreateStripeCustomer({ userId: authUserId, email });
    const origin = await getOrigin();
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: CREDIT_PACK.stripePriceId, quantity: 1 }],
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      metadata: {
        supabase_user_id: authUserId,
        credit_pack: "true",
        credits: String(CREDIT_PACK.credits),
      },
      ...taxOptions(),
    });
    url = session.url;
  } catch (err) {
    console.error("[billing] credit pack checkout failed", err);
    return { error: PAYMENTS_UNAVAILABLE };
  }

  if (!url) return { error: PAYMENTS_UNAVAILABLE };
  redirect(url);
}

export async function createPortalSession(): Promise<BillingActionResult> {
  const { authUserId, email } = await requireCurrentUser();

  let url: string;
  try {
    url = await portalUrl(await getOrCreateStripeCustomer({ userId: authUserId, email }));
  } catch (err) {
    console.error("[billing] portal failed", err);
    return { error: PAYMENTS_UNAVAILABLE };
  }
  redirect(url);
}
