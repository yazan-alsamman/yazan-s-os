import { describe, expect, it } from "vitest";

import { generateObjectKey } from "./storage-service";

describe("generateObjectKey", () => {
  it("creates an opaque, dated key under the namespace", () => {
    const key = generateObjectKey("evidence", new Date("2026-03-15T12:00:00Z"));
    expect(key).toMatch(/^evidence\/2026\/03\/[0-9a-f-]{36}$/);
  });

  it("never reuses keys", () => {
    expect(generateObjectKey("evidence")).not.toBe(generateObjectKey("evidence"));
  });

  it.each(["../etc", "Evidence", "a/b", ""])("rejects unsafe namespace %j", (namespace) => {
    expect(() => generateObjectKey(namespace)).toThrow();
  });
});
