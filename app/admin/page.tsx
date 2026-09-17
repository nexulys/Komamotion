import { AlertTriangle, Coins, DollarSign, TrendingUp, Users, Video } from "lucide-react";
import { getAdminOverview } from "@/lib/admin/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatUsd(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  variant,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  variant?: "default" | "warning" | "success";
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon
          className={
            variant === "warning"
              ? "size-4 text-amber-400"
              : variant === "success"
              ? "size-4 text-emerald-400"
              : "size-4 text-primary"
          }
        />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const stats = await getAdminOverview();

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin overview</h1>
        <p className="text-sm text-muted-foreground">
          KomaMotion AI — Nexulys Ecosystem internal dashboard. Metrics below are rolling 30-day
          windows unless noted.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total users"
          value={stats.totalUsers.toLocaleString()}
          sub={`${stats.activeSubscriptions.toLocaleString()} active subscriptions`}
        />
        <StatCard
          icon={TrendingUp}
          label="Estimated MRR"
          value={formatUsd(stats.mrr)}
          sub="Sum of active plan prices"
        />
        <StatCard
          icon={Video}
          label="Renders (30d)"
          value={stats.generationsLast30d.toLocaleString()}
          sub={`${stats.completedLast30d} completed · ${stats.failedLast30d} failed`}
        />
        <StatCard
          icon={AlertTriangle}
          label="Render error rate"
          value={`${(stats.errorRate * 100).toFixed(1)}%`}
          variant={stats.errorRate > 0.1 ? "warning" : "success"}
          sub="Failed / (failed + completed), 30d"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={DollarSign}
          label="Estimated AI spend (30d)"
          value={formatUsd(stats.estimatedAiCostUsd)}
          sub="Sum of per-generation provider cost estimates"
        />
        <StatCard
          icon={Coins}
          label="Credits charged (30d)"
          value={stats.creditsCharged.toLocaleString()}
        />
        <StatCard
          icon={DollarSign}
          label="Estimated revenue (30d)"
          value={formatUsd(stats.estimatedRevenueUsd)}
          sub="Credits charged × blended $/credit"
        />
        <StatCard
          icon={TrendingUp}
          label="Estimated margin (30d)"
          value={formatUsd(stats.estimatedMarginUsd)}
          variant={stats.estimatedMarginUsd >= 0 ? "success" : "warning"}
          sub="Estimated revenue − estimated AI spend"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(stats.planCounts).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between text-sm">
                <span className="capitalize text-muted-foreground">{plan}</span>
                <Badge variant="secondary">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retention (7-day active)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{(stats.retentionRate * 100).toFixed(1)}%</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.activeUsers7d.toLocaleString()} of {stats.totalUsers.toLocaleString()} users
              created a render in the last 7 days
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
