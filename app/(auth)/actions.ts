"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export type AuthActionState = {
  error?: string;
  message?: string;
} | null;

/** Turnstile token from the form, when captcha is configured (see components/turnstile.tsx). */
function captchaToken(formData: FormData) {
  const token = formData.get("cf-turnstile-response");
  return typeof token === "string" && token ? token : undefined;
}

const CAPTCHA_ERROR = "Please complete the security check and try again.";
function authErrorMessage(message: string) {
  return message.toLowerCase().includes("captcha") ? CAPTCHA_ERROR : message;
}

/** Public origin for links in auth emails: the configured app URL first, so they never point at a preview host. */
async function siteOrigin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_APP_URL || h.get("origin") || `https://${h.get("host")}`;
}

export async function login(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: captchaToken(formData) },
  });

  if (error) {
    return { error: authErrorMessage(error.message) };
  }

  redirect(next);
}

export async function register(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const origin = await siteOrigin();

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: displayName },
      emailRedirectTo: `${origin}/callback`,
      captchaToken: captchaToken(formData),
    },
  });

  if (error) {
    return { error: authErrorMessage(error.message) };
  }

  redirect("/login?registered=1");
}

export async function signInWithGoogle() {
  const origin = await siteOrigin();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/callback` },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth_failed");
  }

  redirect(data.url);
}

export async function requestPasswordReset(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter the email you signed up with." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/callback?next=/reset-password`,
    captchaToken: captchaToken(formData),
  });
  // Rate limits are worth surfacing; anything else gets the same answer
  // whether or not the account exists, so this can't be used to probe emails.
  if (error?.status === 429) return { error: "Too many requests — please wait a few minutes and try again." };
  if (error?.message?.toLowerCase().includes("captcha")) return { error: CAPTCHA_ERROR };

  return { message: "If an account exists for that email, a reset link is on its way. Check your inbox (and spam)." };
}

export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "This reset link has expired. Request a new one from the login page." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/projects?password=updated");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
