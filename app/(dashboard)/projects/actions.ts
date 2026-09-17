"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/supabase/queries";

export async function createProject(formData: FormData) {
  const { authUserId } = await requireCurrentUser();
  const title = String(formData.get("title") ?? "").trim() || "Untitled project";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: authUserId, title })
    .select("id")
    .single();

  if (error) throw error;

  redirect(`/editor/${data.id}`);
}

export async function deleteProject(projectId: string) {
  const { authUserId } = await requireCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", authUserId);

  if (error) throw error;

  revalidatePath("/projects");
}
