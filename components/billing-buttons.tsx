"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  createCheckoutSession,
  createCreditPackCheckout,
  createPortalSession,
  type BillingActionResult,
} from "@/app/(dashboard)/billing/actions";

/** Success redirects to Stripe; only a failure comes back, as a message. */
function runBillingAction(action: () => Promise<BillingActionResult>) {
  return async () => {
    const result = await action();
    if (result?.error) toast.error(result.error);
  };
}

export function SubscribeButton({
  planId,
  variant,
  currentPlan,
  purchasable = true,
  hasSubscription = false,
}: {
  planId: string;
  variant: "brand" | "outline";
  currentPlan: string | undefined;
  /** false for the free tier — it isn't a Stripe checkout target. */
  purchasable?: boolean;
  /** Subscribers switch plans in the Stripe portal instead of a new checkout. */
  hasSubscription?: boolean;
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
      onClick={() => startTransition(runBillingAction(() => createCheckoutSession(planId)))}
    >
      {isPending && <Loader2 className="size-4 animate-spin" />}
      {isCurrent ? "Current plan" : hasSubscription ? "Switch plan" : "Subscribe"}
    </Button>
  );
}

export function BuyCreditPackButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(runBillingAction(createCreditPackCheckout))}
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
      onClick={() => startTransition(runBillingAction(createPortalSession))}
    >
      {isPending && <Loader2 className="size-4 animate-spin" />}
      Manage subscription
    </Button>
  );
}
