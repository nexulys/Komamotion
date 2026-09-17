"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, setUserAdmin, grantAdminCredits } from "@/lib/admin/queries";

export async function toggleUserAdmin(userId: string, isAdmin: boolean) {
  await requireAdmin();
  await setUserAdmin(userId, isAdmin);
  revalidatePath("/admin/users");
}

export async function grantCredits(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const reason = String(formData.get("reason") ?? "Admin adjustment");

  if (!userId || !Number.isFinite(amount) || amount === 0) return;

  await grantAdminCredits(userId, amount, reason);
  revalidatePath("/admin/users");
}
