export type Plan = {
  id: "starter" | "studio" | "pro";
  name: string;
  description: string;
  price: number;
  credits: number;
  stripePriceId: string;
  highlighted?: boolean;
  features: string[];
};

/**
 * 1 credit == 1 second of rendered output video at 1080p.
 * 4K renders consume credits at 2x the 1080p rate (see lib/stripe/credits.ts).
 */
export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "For solo creators testing the waters.",
    price: 19,
    credits: 600,
    stripePriceId: process.env.STRIPE_PRICE_STARTER ?? "price_starter",
    features: [
      "600 render credits / month",
      "1080p MP4 export",
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
    highlighted: true,
    features: [
      "2,000 render credits / month",
      "1080p & 4K MP4 export",
      "AI dynamic colorization",
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
    features: [
      "7,000 render credits / month",
      "1080p & 4K MP4 export",
      "AI dynamic colorization",
      "Highest render priority",
      "Team seats & shared projects",
      "Priority support",
    ],
  },
];

export const CREDIT_PACK = {
  stripePriceId: process.env.STRIPE_PRICE_CREDIT_PACK ?? "price_credit_pack",
  credits: 500,
  price: 15,
};

export function getPlanById(id: string | null | undefined) {
  return PLANS.find((p) => p.id === id) ?? null;
}

export function getPlanByPriceId(priceId: string | null | undefined) {
  return PLANS.find((p) => p.stripePriceId === priceId) ?? null;
}
