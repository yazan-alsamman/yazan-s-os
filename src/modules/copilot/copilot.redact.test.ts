import { describe, expect, it } from "vitest";

import { redact, redactDeep } from "./copilot.redact";

describe("copilot secret redaction", () => {
  it("redacts common credential shapes", () => {
    expect(redact("key is sk-abcdef0123456789ABCDEF here")).toContain("[REDACTED]");
    expect(redact("token AKIAIOSFODNN7EXAMPLE")).toContain("[REDACTED]");
    expect(redact("ghp_0123456789abcdef0123456789abcdef0123")).toContain("[REDACTED]");
    expect(redact("Authorization: Bearer abcdef0123456789abcdef")).toContain("Bearer [REDACTED]");
  });

  it("redacts key=value secrets and database credentials", () => {
    expect(redact("password=hunter2secret")).toBe("password=[REDACTED]");
    expect(redact("api_key: 1234567890abcdef")).toContain("[REDACTED]");
    expect(redact("postgres://user:passw0rd@db:5432/app")).toBe(
      "postgres://[REDACTED]@db:5432/app",
    );
  });

  it("leaves ordinary text untouched", () => {
    const text = "Shipped 3 projects and reached level 4 in TypeScript.";
    expect(redact(text)).toBe(text);
  });

  it("redacts deeply through objects and arrays", () => {
    const out = redactDeep({
      note: "secret=topsecretvalue",
      items: [{ k: "AKIAIOSFODNN7EXAMPLE" }],
      count: 3,
    });
    expect(out.note).toBe("secret=[REDACTED]");
    expect(out.items[0]!.k).toContain("[REDACTED]");
    expect(out.count).toBe(3);
  });
});
