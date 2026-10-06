import { Coins, Sparkles } from "lucide-react";
import { requireCurrentUser, getCreditTransactions } from "@/lib/supabase/queries";
import { ALL_PLANS, CREDIT_PACK } from "@/lib/stripe/plans";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BuyCreditPackButton,
  ManageSubscriptionButton,
  SubscribeButton,
} from "@/components/billing-buttons";

export default async function BillingPage() {
  const { authUserId, profile } = await requireCurrentUser();
  const transactions = await getCreditTransactions(authUserId);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing & credits</h1>
        <p className="text-sm text-muted-foreground">
          Manage your KomaMotion subscription and render credits.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="size-4 text-primary" />
              Current balance
            </CardTitle>
            <CardDescription>
              Plan: <span className="capitalize text-foreground">{profile?.plan ?? "starter"}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="brand" className="text-base">
              {(profile?.credits_balance ?? 0).toLocaleString()} credits
            </Badge>
            {profile?.stripe_customer_id && <ManageSubscriptionButton />}
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/10 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Need more credits right now?</p>
            <p className="text-xs text-muted-foreground">
              {CREDIT_PACK.credits.toLocaleString()} credits for ${CREDIT_PACK.price}, no subscription change.
            </p>
          </div>
          <BuyCreditPackButton />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-4 text-lg font-medium">Plans</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {ALL_PLANS.map((plan) => (
            <Card key={plan.id} className={plan.highlighted ? "border-primary/60" : undefined}>
              <CardHeader>
                {plan.highlighted && (
                  <Badge variant="brand" className="mb-2 w-fit">
                    Most popular
                  </Badge>
                )}
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="pt-4">
                  <span className="text-3xl font-semibold">${plan.price}</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-medium">{plan.credits.toLocaleString()} credits / mo</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <SubscribeButton
                  planId={plan.id}
                  variant={plan.highlighted ? "brand" : "outline"}
                  currentPlan={profile?.plan}
                  purchasable={plan.stripePriceId !== null}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium">Transaction history</h2>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {transactions.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No transactions yet.
              </p>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium capitalize">{tx.type.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString()}
                      {tx.description ? ` · ${tx.description}` : ""}
                    </p>
                  </div>
                  <Badge variant={tx.amount >= 0 ? "success" : "outline"}>
                    {tx.amount >= 0 ? "+" : ""}
                    {tx.amount}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
