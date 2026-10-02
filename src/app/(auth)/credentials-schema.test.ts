import { describe, expect, it } from "vitest";

import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

import { safeRedirectPath, signUpSchema } from "./credentials-schema";

describe("safeRedirectPath", () => {
  it.each(["/projects", "/settings?tab=account"])("keeps same-site path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    null,
    undefined,
    "",
  ])("falls back to the Command Center for unsafe target %j", (target) => {
    expect(safeRedirectPath(target)).toBe("/command-center");
  });
});

describe("signUpSchema", () => {
  it(`requires at least ${MIN_PASSWORD_LENGTH} password characters`, () => {
    const base = { name: "A", email: "a@peos-test.invalid" };
    expect(signUpSchema.safeParse({ ...base, password: "x".repeat(11) }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "x".repeat(12) }).success).toBe(true);
  });
});
