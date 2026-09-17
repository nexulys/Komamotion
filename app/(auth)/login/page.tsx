"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { login, signInWithGoogle } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/projects";
  const justRegistered = searchParams.get("registered") === "1";
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>
          Log in to continue animating your manga panels.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {justRegistered && (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Account created. Check your email to confirm, then log in.
          </p>
        )}
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@studio.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" variant="brand" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Log in
          </Button>
        </form>
        <div className="relative py-2 text-center text-xs text-muted-foreground">
          <span className="bg-card relative z-10 px-2">or</span>
          <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        </div>
        <form action={signInWithGoogle}>
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
