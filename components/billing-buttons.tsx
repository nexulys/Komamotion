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
}: {
  planId: string;
  variant: "brand" | "outline";
  currentPlan: string | undefined;
}) {
  const [isPending, startTransition] = useTransition();
  const isCurrent = currentPlan === planId;

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
