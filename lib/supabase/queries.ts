import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/supabase/types";

export async function getCurrentUser(): Promise<{
  authUserId: string;
  email: string | null;
  profile: UserRow | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  return { authUserId: user.id, email: user.email ?? null, profile: profile ?? null };
}

export async function requireCurrentUser() {
  const current = await getCurrentUser();
  if (!current) {
    throw new Error("Not authenticated");
  }
  return current;
}

export async function getProjectsForUser(userId: string) {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!projects.length) return [];

  const { data: generations } = await supabase
    .from("generations")
    .select("id, project_id, status, output_video_url, thumbnail_url, created_at")
    .in(
      "project_id",
      projects.map((p) => p.id)
    )
    .order("created_at", { ascending: false });

  return projects.map((project) => ({
    ...project,
    generations: (generations ?? []).filter((g) => g.project_id === project.id),
  }));
}

export async function getProjectById(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function getCreditTransactions(userId: string, limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getGenerationsForProject(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
