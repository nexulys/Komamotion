"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { syncTriggerEnv } from "@/app/admin/setup/actions";
import { Button } from "@/components/ui/button";

/** Copies the variables the background tasks need from Vercel to Trigger.dev, then re-runs the checks. */
export function TriggerEnvButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const { data, error } = await syncTriggerEnv();
      if (error || !data) {
        toast.error(error ?? "La copie a échoué.");
        return;
      }
      toast.success(`Copié vers Trigger.dev : ${data.copied.join(", ")}.`);
      if (data.missing.length) toast.warning(`Absentes de Vercel, donc pas copiées : ${data.missing.join(", ")}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm">
        Les tâches de fond tournent chez Trigger.dev et ne voient pas les variables de Vercel. Je peux les y recopier
        (Supabase, adresse du site, fal.ai, secret des webhooks, ElevenLabs si présent). À refaire après chaque
        changement de clé dans Vercel.
      </p>
      <Button type="button" variant="brand" size="sm" disabled={busy} onClick={run}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        Copier de Vercel vers Trigger.dev
      </Button>
    </div>
  );
}
