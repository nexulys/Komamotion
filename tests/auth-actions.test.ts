import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as [string, unknown][],
  error: null as { message: string; status?: number } | null,
  redirectedTo: null as string | null,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://app.example" }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    h.redirectedTo = to;
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async (args: unknown) => (h.calls.push(["signIn", args]), { error: h.error }),
      signUp: async (args: unknown) => (h.calls.push(["signUp", args]), { error: h.error }),
      resetPasswordForEmail: async (email: string, opts: unknown) => (h.calls.push(["reset", { email, opts }]), { error: h.error }),
    },
  }),
}));

import { login, register, requestPasswordReset } from "@/app/(auth)/actions";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  h.calls = [];
  h.error = null;
  h.redirectedTo = null;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("auth actions pass the captcha token to Supabase", () => {
  it("login", async () => {
    await expect(login(null, form({ email: "a@b.c", password: "pw", next: "/billing", "cf-turnstile-response": "tok" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(h.calls[0]).toEqual(["signIn", { email: "a@b.c", password: "pw", options: { captchaToken: "tok" } }]);
    expect(h.redirectedTo).toBe("/billing");
  });

  it("sign-up", async () => {
    await expect(register(null, form({ email: "a@b.c", password: "longenough", displayName: "A", "cf-turnstile-response": "tok" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(h.calls[0][1]).toMatchObject({ options: { captchaToken: "tok", emailRedirectTo: "https://app.example/callback" } });
  });

  it("password reset", async () => {
    const r = await requestPasswordReset(null, form({ email: "a@b.c", "cf-turnstile-response": "tok" }));
    expect(r?.message).toMatch(/reset link is on its way/);
    expect(h.calls[0][1]).toMatchObject({ opts: { captchaToken: "tok", redirectTo: "https://app.example/callback?next=/reset-password" } });
  });

  it("works without a captcha configured (no token sent)", async () => {
    await expect(login(null, form({ email: "a@b.c", password: "pw" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(h.calls[0][1]).toMatchObject({ options: { captchaToken: undefined } });
  });

  it("explains a failed security check", async () => {
    h.error = { message: "captcha protection: request disallowed (timeout-or-duplicate)" };
    expect(await login(null, form({ email: "a@b.c", password: "pw" }))).toEqual({
      error: "Please complete the security check and try again.",
    });
  });
});
