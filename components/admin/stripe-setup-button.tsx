"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Wand2 } from "lucide-react";
import { setupStripe } from "@/app/admin/setup/actions";
import { Button } from "@/components/ui/button";
import type { StripeSetupResult } from "@/lib/stripe/setup";

function CopyLine({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{name}</p>
        <p className="font-mono text-xs break-all">{value}</p>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Copier ${name}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast.success(`${name} copié`);
          } catch {
            toast.error("Copie impossible : sélectionne le texte à la main.");
          }
        }}
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}

/** Creates the plans, credit pack and webhook in Stripe, then lists what to paste into Vercel. */
export function StripeSetupButton({ webhookSecretConfigured }: { webhookSecretConfigured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StripeSetupResult | null>(null);

  async function run() {
    setBusy(true);
    try {
      const { data, error } = await setupStripe();
      if (error || !data) {
        toast.error(error ?? "La création a échoué.");
        return;
      }
      setResult(data);
      toast.success("Stripe est prêt : copie les valeurs dans Vercel.");
    } finally {
      setBusy(false);
    }
  }

  if (!result) {
    return (
      <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm">
          Je peux créer pour toi, dans le mode de ta clé Stripe (test ou live), les 3 abonnements, le pack de crédits et
          le webhook avec les bons événements. Ce qui existe déjà et qui est correct est réutilisé.
        </p>
        <Button type="button" variant="brand" size="sm" disabled={busy} onClick={run}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          Créer dans Stripe
        </Button>
      </div>
    );
  }

  const lines = result.prices.map((p) => ({ name: p.envVar, value: p.priceId }));
  if (result.webhook.secret) lines.push({ name: "STRIPE_WEBHOOK_SECRET", value: result.webhook.secret });

  return (
    <div className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm">
      <p className="font-medium">
        Vercel → Settings → Environment Variables : ajoute (ou remplace) ces valeurs en type Secret, puis redéploie.
      </p>
      <div className="space-y-2">
        {lines.map((line) => (
          <CopyLine key={line.name} {...line} />
        ))}
      </div>
      {result.webhook.secret && (
        <p className="text-xs text-muted-foreground">
          Le secret du webhook n&apos;est affiché qu&apos;une fois : copie-le maintenant.
        </p>
      )}
      {!result.webhook.secret && !webhookSecretConfigured && (
        <p className="text-xs text-amber-400">
          Le webhook existait déjà{result.webhook.updated ? " (ses événements ont été complétés)" : ""} : récupère son
          « Signing secret » dans Stripe → Developers → Webhooks → {result.webhook.url} → Reveal, et mets-le dans
          STRIPE_WEBHOOK_SECRET.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Il reste à activer le portail client dans Stripe (Settings → Billing → Customer portal → Save), voir guide §5.
      </p>
    </div>
  );
}
