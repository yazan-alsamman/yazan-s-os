import { describe, expect, it } from "vitest";
import { z } from "zod";

import { expiryStateOf } from "@/modules/certifications/certification.schemas";
import { isValidLevel, levelLabel } from "@/modules/skills/level-models";
import { createSkillSchema, updateSkillSchema } from "@/modules/skills/skill.schemas";

import {
  idSetSchema,
  isoDate,
  normalizeKey,
  optionalHttpUrl,
  optionalIsoDate,
  optionalText,
  requiredText,
  slugify,
} from "./fields";

describe("field validators", () => {
  it("requiredText trims and rejects blank and control characters", () => {
    const schema = requiredText(5);
    expect(schema.parse("  ok  ")).toBe("ok");
    expect(schema.safeParse("   ").success).toBe(false);
    expect(schema.safeParse("toolong").success).toBe(false);
    expect(schema.safeParse("a\u0007b").success).toBe(false);
  });

  it("optional fields distinguish omitted (undefined) from cleared (null)", () => {
    const schema = z.object({ note: optionalText(10), date: optionalIsoDate });
    expect(schema.parse({})).toEqual({ note: undefined, date: undefined });
    expect(schema.parse({ note: "", date: "" })).toEqual({ note: null, date: null });
    expect(schema.parse({ note: null, date: null })).toEqual({ note: null, date: null });
  });

  it.each(["https://example.invalid/a?b=c", "http://localhost:3000"])("accepts URL %s", (url) => {
    expect(optionalHttpUrl.parse(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///etc/passwd",
    "ftp://x.invalid",
    "not a url",
  ])("rejects URL %s", (url) => {
    expect(optionalHttpUrl.safeParse(url).success).toBe(false);
  });

  it("isoDate accepts real calendar dates only", () => {
    expect(isoDate.parse("2024-02-29").toISOString()).toBe("2024-02-29T00:00:00.000Z");
    for (const bad of ["2023-02-29", "2024-13-01", "24-01-01", "1800-01-01"]) {
      expect(isoDate.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("idSetSchema dedupes and requires UUIDs", () => {
    const id = crypto.randomUUID();
    expect(idSetSchema.parse([id, id])).toEqual([id]);
    expect(idSetSchema.safeParse(["1"]).success).toBe(false);
  });

  it("normalizes keys and slugs", () => {
    expect(normalizeKey("  Node.JS   Runtime ")).toBe("node.js runtime");
    expect(slugify("Ünïcode Project — v2!")).toBe("unicode-project-v2");
    expect(slugify("!!!")).toBe("project");
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(72);
  });
});

describe("skill level model (01 §6)", () => {
  it("supports the default 0–5 scale with spec labels", () => {
    expect(levelLabel("peos-default-v1", 0)).toBe("Not evaluated");
    expect(levelLabel("peos-default-v1", 5)).toBe("Expert / can lead");
    expect(isValidLevel("peos-default-v1", 6)).toBe(false);
    expect(createSkillSchema.safeParse({ name: "X", targetLevel: 6 }).success).toBe(false);
    expect(createSkillSchema.safeParse({ name: "X", levelModel: "unknown" }).success).toBe(false);
    expect(updateSkillSchema.safeParse({}).success).toBe(false);
  });
});

describe("certification expiry state", () => {
  const now = new Date("2026-10-02T15:00:00Z");
  it.each([
    [null, "no_expiry"],
    ["2026-10-01", "expired"],
    ["2026-10-02", "expiring"],
    ["2026-12-31", "expiring"],
    ["2027-06-01", "valid"],
  ] as const)("%s → %s", (date, state) => {
    expect(expiryStateOf(date ? new Date(`${date}T00:00:00Z`) : null, now)).toBe(state);
  });
});
