"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createCheckoutSession,
  createCreditPackCheckout,
  createPortalSession,
} from "@/app/(dashboard)/billing/actions";

export function SubscribeButton({
  planId,
  variant,
  currentPlan,
  purchasable = true,
}: {
  planId: string;
  variant: "brand" | "outline";
  currentPlan: string | undefined;
  /** false for the free tier — it isn't a Stripe checkout target. */
  purchasable?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const isCurrent = currentPlan === planId;

  if (!purchasable) {
    return (
      <Button variant="outline" className="w-full" disabled>
        {isCurrent ? "Current plan" : "Free tier"}
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      className="w-full"
      disabled={isPending || isCurrent}
      onClick={() => startTransition(() => createCheckoutSession(planId))}
    >
      {isPending && <Loader2 className="size-4 animate-spin" />}
      {isCurrent ? "Current plan" : "Subscribe"}
    </Button>
  );
}

export function BuyCreditPackButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(() => createCreditPackCheckout())}
    >
      {isPending && <Loader2 className="size-4 animate-spin" />}
      Buy credit pack
    </Button>
  );
}

export function ManageSubscriptionButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={isPending}
      onClick={() => startTransition(() => createPortalSession())}
    >
      {isPending && <Loader2 className="size-4 animate-spin" />}
      Manage subscription
    </Button>
  );
}
