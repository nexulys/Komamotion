import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/editor/123?tab=x")).toBe("/editor/123?tab=x");
    expect(safeNextPath("/billing")).toBe("/billing");
  });

  it("falls back for anything that could leave the site", () => {
    for (const next of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "evil.example",
      "",
      null,
      undefined,
    ]) {
      expect(safeNextPath(next)).toBe("/projects");
    }
  });
});
