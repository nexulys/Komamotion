"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { deleteAccount } from "@/app/(dashboard)/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteAccountForm() {
  const [state, formAction, isPending] = useActionState(deleteAccount, null);
  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="confirm">Type DELETE to confirm</Label>
        <Input id="confirm" name="confirm" autoComplete="off" placeholder="DELETE" required />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" variant="destructive" disabled={isPending}>
        {isPending && <Loader2 className="size-4 animate-spin" />}
        Delete my account permanently
      </Button>
    </form>
  );
}
