import type { PlanId } from "@/lib/supabase/types";

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  price: number;
  credits: number;
  /** null for the free tier — it's not a Stripe checkout target. */
  stripePriceId: string | null;
  /** Free-tier renders get a "KomaMotion AI Free" watermark burned in. */
  watermark: boolean;
  highlighted?: boolean;
  features: string[];
};

/**
 * 1 credit == 1 second of rendered output video at 1080p.
 * 4K renders consume credits at 2x the 1080p rate (see lib/stripe/credits.ts).
 */
export const FREE_PLAN: Plan = {
  id: "free",
  name: "Free",
  description: "Try KomaMotion AI, no card required.",
  price: 0,
  credits: 20,
  stripePriceId: null,
  watermark: true,
  features: [
    "20 render credits on signup",
    "720p preview export",
    "\"KomaMotion AI Free\" watermark",
    "Standard queue priority",
  ],
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "For solo creators testing the waters.",
    price: 19,
    credits: 600,
    stripePriceId: process.env.STRIPE_PRICE_STARTER ?? "price_starter",
    watermark: false,
    features: [
      "600 render credits / month",
      "1080p MP4 export, no watermark",
      "Standard queue priority",
      "Community support",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    description: "For active webtoon and manga creators.",
    price: 49,
    credits: 2000,
    stripePriceId: process.env.STRIPE_PRICE_STUDIO ?? "price_studio",
    watermark: false,
    highlighted: true,
    features: [
      "2,000 render credits / month",
      "1080p & 4K MP4 export",
      "AI colorization, panel cleanup & upscaling",
      "Priority render queue",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro Studio",
    description: "For animation studios at scale.",
    price: 149,
    credits: 7000,
    stripePriceId: process.env.STRIPE_PRICE_PRO ?? "price_pro",
    watermark: false,
    features: [
      "7,000 render credits / month",
      "1080p & 4K MP4 export",
      "AI colorization, panel cleanup & upscaling",
      "Batch chapter processing",
      "Highest render priority",
      "Team seats & shared projects",
      "Priority support",
    ],
  },
];

/** Free + paid tiers, in display order — use for pricing pages. */
export const ALL_PLANS: Plan[] = [FREE_PLAN, ...PLANS];

export const CREDIT_PACK = {
  stripePriceId: process.env.STRIPE_PRICE_CREDIT_PACK ?? "price_credit_pack",
  credits: 500,
  price: 15,
};

export function getPlanById(id: string | null | undefined) {
  return ALL_PLANS.find((p) => p.id === id) ?? null;
}

export function getPlanByPriceId(priceId: string | null | undefined) {
  if (!priceId) return null;
  return PLANS.find((p) => p.stripePriceId === priceId) ?? null;
}

export function planHasWatermark(planId: string | null | undefined) {
  return getPlanById(planId)?.watermark ?? true;
}
