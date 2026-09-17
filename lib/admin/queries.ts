import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/supabase/queries";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe/plans";

/**
 * Every admin page/action calls this first. Reads happen through the
 * service-role client (deliberately bypassing per-row RLS — an admin
 * dashboard needs to aggregate across every user), but access to that
 * client is gated behind this check on `users.is_admin`.
 */
export async function requireAdmin() {
  const current = await requireCurrentUser();
  if (!current.profile?.is_admin) {
    redirect("/projects");
  }
  return current;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Blended $-per-credit implied by paid plan pricing, used only to turn
// "credits charged" into a rough revenue estimate for the margin panel.
const BLENDED_REVENUE_PER_CREDIT =
  PLANS.reduce((sum, p) => sum + p.price, 0) / PLANS.reduce((sum, p) => sum + p.credits, 0);

export async function getAdminOverview() {
  const admin = createServiceRoleClient();
  const since30d = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const since7d = new Date(Date.now() - 7 * DAY_MS).toISOString();

  const [
    { count: totalUsers },
    { data: planRows },
    { count: activeSubscriptions },
    { data: recentGenerations },
    { data: recentDebits },
    { data: activeUserRows },
  ] = await Promise.all([
    admin.from("users").select("*", { count: "exact", head: true }),
    admin.from("users").select("plan"),
    admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("stripe_subscription_status", "active"),
    admin
      .from("generations")
      .select("status, estimated_cost_usd, credits_cost, created_at")
      .gte("created_at", since30d),
    admin
      .from("credit_transactions")
      .select("amount")
      .eq("type", "generation_debit")
      .gte("created_at", since30d),
    admin.from("generations").select("user_id").gte("created_at", since7d),
  ]);

  const planCounts = (planRows ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.plan] = (acc[row.plan] ?? 0) + 1;
    return acc;
  }, {});

  const mrr = PLANS.reduce((sum, plan) => sum + plan.price * (planCounts[plan.id] ?? 0), 0);

  const completed = (recentGenerations ?? []).filter((g) => g.status === "completed").length;
  const failed = (recentGenerations ?? []).filter((g) => g.status === "failed").length;
  const resolved = completed + failed;
  const errorRate = resolved > 0 ? failed / resolved : 0;

  const estimatedAiCostUsd = (recentGenerations ?? []).reduce(
    (sum, g) => sum + (g.estimated_cost_usd ?? 0),
    0
  );
  const creditsCharged = (recentDebits ?? []).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const estimatedRevenueUsd = creditsCharged * BLENDED_REVENUE_PER_CREDIT;
  const estimatedMarginUsd = estimatedRevenueUsd - estimatedAiCostUsd;

  const activeUsers7d = new Set((activeUserRows ?? []).map((r) => r.user_id)).size;
  const retentionRate = totalUsers ? activeUsers7d / totalUsers : 0;

  return {
    totalUsers: totalUsers ?? 0,
    planCounts,
    activeSubscriptions: activeSubscriptions ?? 0,
    mrr,
    generationsLast30d: recentGenerations?.length ?? 0,
    completedLast30d: completed,
    failedLast30d: failed,
    errorRate,
    estimatedAiCostUsd,
    creditsCharged,
    estimatedRevenueUsd,
    estimatedMarginUsd,
    activeUsers7d,
    retentionRate,
  };
}

export async function getAdminUsers(limit = 50) {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getAdminGenerations(limit = 50) {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("generations")
    .select("id, user_id, status, provider, resolution, credits_cost, estimated_cost_usd, error_message, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function setUserAdmin(userId: string, isAdmin: boolean) {
  const admin = createServiceRoleClient();
  await admin.from("users").update({ is_admin: isAdmin }).eq("id", userId);
}

export async function grantAdminCredits(userId: string, amount: number, description: string) {
  const admin = createServiceRoleClient();
  const { data: user } = await admin.from("users").select("credits_balance").eq("id", userId).single();
  if (!user) throw new Error("User not found");

  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount,
    type: "admin_grant",
    description,
  });
  await admin.from("users").update({ credits_balance: user.credits_balance + amount }).eq("id", userId);
}
