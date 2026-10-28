import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  uploads: [] as { projectRef: string; env: string; params: { variables: Record<string, string>; override?: boolean; isSecret?: boolean } }[],
  uploadError: null as Error | null,
}));

vi.mock("@/lib/admin/queries", () => ({ requireAdmin: async () => ({}) }));
vi.mock("@trigger.dev/sdk", () => ({
  envvars: {
    upload: async (projectRef: string, env: string, params: (typeof h.uploads)[number]["params"]) => {
      if (h.uploadError) throw h.uploadError;
      h.uploads.push({ projectRef, env, params });
      return { success: true };
    },
  },
}));

import { setupStripe, syncTriggerEnv } from "@/app/admin/setup/actions";
import { triggerEnvFromVercel } from "@/lib/admin/trigger-env";

const VERCEL = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  NEXT_PUBLIC_APP_URL: "https://komamotion.vercel.app",
  AI_WEBHOOK_SECRET: "hook",
  FAL_KEY: "id:secret",
  ELEVENLABS_API_KEY: "",
  AI_PROVIDER: "",
  REPLICATE_API_TOKEN: "",
  REPLICATE_MODEL_VERSION: "",
  TRIGGER_SECRET_KEY: "tr_prod_abc",
  TRIGGER_PROJECT_REF: "proj_abc",
};

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const [name, value] of Object.entries(VERCEL)) vi.stubEnv(name, value);
  h.uploads = [];
  h.uploadError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("triggerEnvFromVercel", () => {
  it("splits public and secret values and names what's missing", () => {
    const r = triggerEnvFromVercel({ ...VERCEL, FAL_KEY: undefined, ELEVENLABS_API_KEY: "el" });
    expect(r.publicVars).toEqual({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_APP_URL: "https://komamotion.vercel.app" });
    expect(r.secretVars).toEqual({ SUPABASE_SERVICE_ROLE_KEY: "service", AI_WEBHOOK_SECRET: "hook", ELEVENLABS_API_KEY: "el" });
    expect(r.missing).toEqual(["FAL_KEY"]);
  });
});

describe("syncTriggerEnv", () => {
  it("copies Vercel's values into Trigger.dev Production, secrets as secrets", async () => {
    const r = await syncTriggerEnv();
    expect(r.data).toEqual({
      copied: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL", "SUPABASE_SERVICE_ROLE_KEY", "AI_WEBHOOK_SECRET", "FAL_KEY"],
      missing: [],
    });
    expect(h.uploads.map((u) => [u.projectRef, u.env, u.params.override, u.params.isSecret ?? false])).toEqual([
      ["proj_abc", "prod", true, false],
      ["proj_abc", "prod", true, true],
    ]);
    expect(h.uploads[1].params.variables.FAL_KEY).toBe("id:secret");
  });

  it("needs the production key and the project ref", async () => {
    vi.stubEnv("TRIGGER_SECRET_KEY", "tr_dev_abc");
    expect((await syncTriggerEnv()).error).toMatch(/clé Production/);
    vi.stubEnv("TRIGGER_SECRET_KEY", "tr_prod_abc");
    vi.stubEnv("TRIGGER_PROJECT_REF", "");
    expect((await syncTriggerEnv()).error).toMatch(/TRIGGER_PROJECT_REF/);
    expect(h.uploads).toEqual([]);
  });

  it("points to the manual steps when Trigger.dev refuses", async () => {
    h.uploadError = new Error("Unauthorized");
    expect((await syncTriggerEnv()).error).toMatch(/Unauthorized.*guide §4.3/);
  });
});

describe("setupStripe guards", () => {
  it("needs a Stripe key and an https site address", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect((await setupStripe()).error).toMatch(/STRIPE_SECRET_KEY/);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    expect((await setupStripe()).error).toMatch(/https/);
  });
});
