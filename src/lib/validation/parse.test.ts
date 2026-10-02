import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseInput } from "./parse";

const schema = z.object({ id: z.uuid(), limit: z.coerce.number().int().max(100) });

describe("parseInput", () => {
  it("returns typed, coerced output for valid input", () => {
    const id = crypto.randomUUID();
    expect(parseInput(schema, { id, limit: "20" })).toEqual({ id, limit: 20 });
  });

  it("throws VALIDATION_FAILED with per-field details", () => {
    try {
      parseInput(schema, { id: "not-a-uuid", limit: 500 });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "VALIDATION_FAILED", status: 400 });
      const paths = (error as { details: { path: string }[] }).details.map((d) => d.path);
      expect(paths).toEqual(expect.arrayContaining(["id", "limit"]));
    }
  });
});
