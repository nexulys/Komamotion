import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { getPlanByPriceId } from "@/lib/stripe/plans";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { addCreditsToBalance } from "@/lib/generation/pipeline";

export const runtime = "nodejs";

async function grantCredits({
  userId,
  amount,
  type,
  description,
  eventId,
}: {
  userId: string;
  amount: number;
  type: "subscription_grant" | "purchase";
  description: string;
  eventId: string;
}) {
  const admin = createServiceRoleClient();

  const { data: ledgerRow, error: insertError } = await admin
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount,
      type,
      description,
      stripe_event_id: eventId,
    })
    .select("id")
    .single();

  // Unique index on stripe_event_id makes this idempotent across webhook retries.
  if (insertError) {
    if (insertError.code === "23505") return;
    throw insertError;
  }

  try {
    await addCreditsToBalance(admin, userId, amount);
  } catch (err) {
    // Release the idempotency lock so Stripe's retry can grant the credits.
    await admin.from("credit_transactions").delete().eq("id", ledgerRow.id);
    throw err;
  }
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature ?? "",
      process.env.STRIPE_WEBHOOK_SECRET ?? ""
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      if (!userId) break;

      if (session.metadata?.credit_pack === "true") {
        const credits = Number(session.metadata.credits ?? 0);
        if (credits > 0) {
          await grantCredits({
            userId,
            amount: credits,
            type: "purchase",
            description: "Credit pack purchase",
            eventId: event.id,
          });
        }
      }

      if (session.subscription && typeof session.subscription === "string") {
        await admin
          .from("users")
          .update({ stripe_subscription_id: session.subscription })
          .eq("id", userId);
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;
      if (!userId) break;

      const priceId = subscription.items.data[0]?.price.id;
      const plan = getPlanByPriceId(priceId);

      await admin
        .from("users")
        .update({
          stripe_subscription_id: subscription.id,
          stripe_subscription_status: subscription.status,
          ...(plan ? { plan: plan.id } : {}),
        })
        .eq("id", userId);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;
      if (!userId) break;

      await admin
        .from("users")
        .update({ stripe_subscription_status: "canceled", plan: "starter" })
        .eq("id", userId);
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof invoice.parent?.subscription_details?.subscription === "string"
          ? invoice.parent.subscription_details.subscription
          : undefined;
      if (!subscriptionId) break;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.supabase_user_id;
      if (!userId) break;

      const priceId = subscription.items.data[0]?.price.id;
      const plan = getPlanByPriceId(priceId);
      if (!plan) break;

      await grantCredits({
        userId,
        amount: plan.credits,
        type: "subscription_grant",
        description: `${plan.name} monthly credit grant`,
        eventId: event.id,
      });
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
