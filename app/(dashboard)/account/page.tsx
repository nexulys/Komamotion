import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentUser } from "@/lib/supabase/queries";
import { getPlanById } from "@/lib/stripe/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteAccountForm } from "@/app/(dashboard)/account/delete-account-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { email, profile } = await requireCurrentUser();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">Your profile and data.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Name: </span>
            {profile?.display_name || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Email: </span>
            {email}
          </p>
          <p>
            <span className="text-muted-foreground">Plan: </span>
            {getPlanById(profile?.plan)?.name ?? "Free"} ·{" "}
            <Link href="/billing" className="text-primary hover:underline">
              Manage billing
            </Link>
          </p>
          <p>
            <Link href="/forgot-password" className="text-primary hover:underline">
              Change password
            </Link>
          </p>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Delete account</CardTitle>
          <CardDescription>
            Permanently deletes your account, projects, panels, videos and remaining credits, and cancels any
            subscription. This can&apos;t be undone. Past invoices stay with our payment provider, as the law requires.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountForm />
        </CardContent>
      </Card>
    </div>
  );
}
