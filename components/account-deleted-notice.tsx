"use client";

import { useSearchParams } from "next/navigation";

/** Confirmation after /account deletion redirects home with ?account=deleted. */
export function AccountDeletedNotice() {
  if (useSearchParams().get("account") !== "deleted") return null;
  return (
    <p className="mx-auto mt-6 max-w-7xl rounded-lg border border-border/60 bg-secondary/20 px-6 py-3 text-center text-sm text-muted-foreground">
      Your account and all its data have been deleted. Thanks for trying KomaMotion.
    </p>
  );
}
