"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/supabase/queries";
import { getStripe } from "@/lib/stripe/server";
import { isEntitledStatus } from "@/lib/stripe/subscription";
import {
  MANGA_SOURCES_BUCKET,
  RENDERED_VIDEOS_BUCKET,
  deleteFromStorage,
  deleteUserFolder,
} from "@/lib/supabase/signed-url";

export type DeleteAccountState = { error?: string } | null;

/**
 * GDPR erasure: cancels any running subscription (so a deleted account is
 * never billed again), deletes the user's files, then the auth user — every
 * table cascades from it (projects, renders, exports, credit history).
 */
export async function deleteAccount(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const { authUserId, profile } = await requireCurrentUser();
  const admin = createServiceRoleClient();

  if (profile?.stripe_subscription_id && isEntitledStatus(profile.stripe_subscription_status)) {
    try {
      await getStripe().subscriptions.cancel(profile.stripe_subscription_id);
    } catch (err) {
      console.error("[account] could not cancel subscription", err);
      return { error: "We couldn't cancel your subscription, so your account wasn't deleted. Please try again or contact support." };
    }
  }

  const { data: generations } = await admin.from("generations").select("id").eq("user_id", authUserId);
  await Promise.all([
    deleteUserFolder(MANGA_SOURCES_BUCKET, authUserId),
    deleteUserFolder(RENDERED_VIDEOS_BUCKET, authUserId),
    // Free renders waiting for their watermark sit outside the user folder.
    deleteFromStorage(RENDERED_VIDEOS_BUCKET, (generations ?? []).map((g) => `unprocessed/${g.id}.mp4`)),
  ]);

  const { error } = await admin.auth.admin.deleteUser(authUserId);
  if (error) {
    console.error("[account] could not delete auth user", error);
    return { error: "Something went wrong while deleting your account. Please contact support." };
  }

  await (await createClient()).auth.signOut();
  redirect("/?account=deleted");
}
