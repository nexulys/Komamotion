import { headers } from "next/headers";
import { AlertTriangle, CheckCircle2, CircleDashed, RefreshCw, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/admin/queries";
import { runSetupChecks, type CheckStatus, type SetupCheck } from "@/lib/admin/setup-checks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StripeSetupButton } from "@/components/admin/stripe-setup-button";
import { TriggerEnvButton } from "@/components/admin/trigger-env-button";
import { cn } from "@/lib/utils";

// Live checks against every service: never cache. Each call gives up after 8 s.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STATUS_ICON: Record<CheckStatus, { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  ok: { icon: CheckCircle2, className: "text-emerald-400" },
  warning: { icon: AlertTriangle, className: "text-amber-400" },
  error: { icon: XCircle, className: "text-destructive" },
  manual: { icon: CircleDashed, className: "text-muted-foreground" },
};

function CheckRow({ check }: { check: SetupCheck }) {
  const { icon: Icon, className } = STATUS_ICON[check.status];
  return (
    <li className="flex gap-3 py-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", className)} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{check.label}</p>
        <p className="text-sm break-words text-muted-foreground">{check.detail}</p>
      </div>
    </li>
  );
}

function count(checks: SetupCheck[], status: CheckStatus) {
  return checks.filter((c) => c.status === status).length;
}

/**
 * Setup status for the owner: one card per service, in the order of
 * docs/MISE_EN_PRODUCTION.md (French, like the guide), so what's left to
 * configure can be checked from a phone without opening each dashboard.
 */
export default async function AdminSetupPage() {
  await requireAdmin();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const sections = await runSetupChecks({ requestOrigin: host ? `${proto}://${host}` : null });

  const all = sections.flatMap((s) => s.checks);
  const errors = count(all, "error");
  const warnings = count(all, "warning");
  const stripeKeySet = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const canSyncTrigger =
    Boolean(process.env.TRIGGER_SECRET_KEY?.trim().startsWith("tr_prod_")) && Boolean(process.env.TRIGGER_PROJECT_REF?.trim());
  const nextStep = sections.flatMap((s) => s.checks.map((check) => ({ check, section: s }))).find((x) => x.check.status === "error");

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mise en service</h1>
          <p className="text-sm text-muted-foreground">
            Vérifie en direct chaque service dont le site a besoin. Aucune clé secrète n&apos;est affichée. Les numéros
            (§) renvoient au guide <code>docs/MISE_EN_PRODUCTION.md</code>.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          {/* A full reload re-runs every check. */}
          <a href="/admin/setup">
            <RefreshCw className="size-4" />
            Revérifier
          </a>
        </Button>
      </div>

      <Card className={errors ? "border-destructive/40" : warnings ? "border-amber-500/40" : "border-emerald-500/40"}>
        <CardHeader>
          <CardTitle className="text-base">
            {errors
              ? `${errors} point${errors > 1 ? "s" : ""} bloquant${errors > 1 ? "s" : ""}`
              : warnings
                ? "Le site fonctionne, quelques points à améliorer"
                : "Tout est prêt"}
          </CardTitle>
          <CardDescription className="flex flex-wrap gap-2 pt-1">
            <Badge variant="destructive">{errors} à corriger</Badge>
            <Badge variant="warning">{warnings} à surveiller</Badge>
            <Badge variant="outline">{count(all, "manual")} à vérifier toi-même</Badge>
            <Badge variant="success">{count(all, "ok")} OK</Badge>
          </CardDescription>
        </CardHeader>
        {nextStep && (
          <CardContent className="text-sm">
            <span className="font-medium">Prochaine étape ({nextStep.section.guide}) : </span>
            {nextStep.check.label} — <span className="text-muted-foreground">{nextStep.check.detail}</span>
          </CardContent>
        )}
      </Card>

      {sections.map((section) => (
        <Card key={section.id}>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">{section.title}</CardTitle>
            <span className="shrink-0 text-xs text-muted-foreground">Guide {section.guide}</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y divide-border/60">
              {section.checks.map((check) => (
                <CheckRow key={check.label} check={check} />
              ))}
            </ul>
            {section.id === "trigger" &&
              canSyncTrigger &&
              section.checks.some((c) => c.label.startsWith("Variables d'environnement") && c.status !== "ok") && <TriggerEnvButton />}
            {section.id === "stripe" && stripeKeySet && section.checks.some((c) => c.status === "error") && (
              <StripeSetupButton webhookSecretConfigured={Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim())} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
