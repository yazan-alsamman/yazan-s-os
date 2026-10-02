import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildExchangeDocumentSchema, buildExchangeJsonSchema } from "./exchange-json-schema";
import { parsePeosJson } from "./parsers";

const SCHEMA_FILE = join(process.cwd(), "data", "peos-exchange.schema.json");
const SEED_FILE = join(process.cwd(), "data", "profile.seed.json");

describe("published exchange JSON Schema", () => {
  it("matches the validators (run with PEOS_UPDATE_SCHEMA=1 to regenerate)", () => {
    const generated = `${JSON.stringify(buildExchangeJsonSchema(), null, 2)}\n`;
    if (process.env.PEOS_UPDATE_SCHEMA === "1") writeFileSync(SCHEMA_FILE, generated);
    expect(readFileSync(SCHEMA_FILE, "utf8")).toBe(generated);
  });

  it("documents relationship fields and enum values", () => {
    const schema = buildExchangeJsonSchema() as {
      properties: Record<string, { items?: { properties: Record<string, unknown> } }>;
    };
    expect(Object.keys(schema.properties.projects?.items?.properties ?? {})).toEqual(
      expect.arrayContaining(["name", "status", "skills", "technologies", "evidence"]),
    );
  });

  it("the empty seed template is a valid, record-free exchange document", () => {
    const seed = JSON.parse(readFileSync(SEED_FILE, "utf8")) as unknown;
    expect(buildExchangeDocumentSchema().safeParse(seed).success).toBe(true);
    // It contains no records — PEOS never ships personal facts.
    expect(() => parsePeosJson(JSON.stringify(seed))).toThrow(/no records/);
  });
});
