import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "./csp";

function directives(policy: string) {
  return new Map(
    policy.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values] as const;
    }),
  );
}

describe("buildContentSecurityPolicy", () => {
  const prod = directives(
    buildContentSecurityPolicy({ nonce: "abc123", isDev: false, isHttps: true }),
  );

  it("allows scripts only via the per-request nonce", () => {
    expect(prod.get("script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(prod.get("script-src")).not.toContain("'unsafe-inline'");
  });

  it("forbids eval, framing, plugins and foreign form targets in production", () => {
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("form-action")).toEqual(["'self'"]);
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
  });

  it("adds only the documented development exceptions", () => {
    const dev = directives(buildContentSecurityPolicy({ nonce: "n", isDev: true, isHttps: false }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("connect-src")).toContain("ws:");
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });
});
