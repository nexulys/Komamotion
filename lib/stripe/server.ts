import Stripe from "stripe";

/** The API version this code is written against — webhook endpoints created by the app use it too. */
export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

let stripe: Stripe | null = null;

export function getStripe() {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
    });
  }
  return stripe;
}
