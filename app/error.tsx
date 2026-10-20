"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown when a page throws: a way back instead of the default error screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="size-10 text-amber-400" />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This page hit an unexpected error. Nothing was charged for an action that didn&apos;t complete. Try again, or
        head back to your projects.
        {error.digest && <span className="mt-2 block text-xs">Reference: {error.digest}</span>}
      </p>
      <div className="flex gap-2">
        <Button variant="brand" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/projects">My projects</Link>
        </Button>
      </div>
    </div>
  );
}
