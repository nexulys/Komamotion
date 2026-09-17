"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe/server";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { getPlanById, CREDIT_PACK } from "@/lib/stripe/plans";
import { requireCurrentUser } from "@/lib/supabase/queries";

async function getOrigin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_APP_URL || h.get("origin") || `https://${h.get("host")}`;
}

export async function createCheckoutSession(planId: string) {
  const { authUserId, email } = await requireCurrentUser();
  const plan = getPlanById(planId);
  if (!plan) throw new Error("Unknown plan");

  const customerId = await getOrCreateStripeCustomer({ userId: authUserId, email });
  const origin = await getOrigin();
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
    metadata: { supabase_user_id: authUserId, plan_id: plan.id },
    subscription_data: {
      metadata: { supabase_user_id: authUserId, plan_id: plan.id },
    },
  });

  if (!session.url) throw new Error("Could not create checkout session");
  redirect(session.url);
}

export async function createCreditPackCheckout() {
  const { authUserId, email } = await requireCurrentUser();
  const customerId = await getOrCreateStripeCustomer({ userId: authUserId, email });
  const origin = await getOrigin();
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
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
  });

  if (!session.url) throw new Error("Could not create checkout session");
  redirect(session.url);
}

export async function createPortalSession() {
  const { authUserId, email } = await requireCurrentUser();
  const customerId = await getOrCreateStripeCustomer({ userId: authUserId, email });
  const origin = await getOrigin();
  const stripe = getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/billing`,
  });

  redirect(session.url);
}
