import { getStripe } from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function getOrCreateStripeCustomer({
  userId,
  email,
}: {
  userId: string;
  email: string | null;
}) {
  const admin = createServiceRoleClient();
  const { data: profile } = await admin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { supabase_user_id: userId },
  });

  await admin.from("users").update({ stripe_customer_id: customer.id }).eq("id", userId);

  return customer.id;
}
