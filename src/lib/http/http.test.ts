import { describe, expect, it } from "vitest";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { escapeLike, mapDatabaseError } from "@/lib/db/errors";

import { paginated, searchParamsToObject, sortSchema } from "./pagination";
import { parseId } from "./params";
import { readJsonBody } from "./request-body";
import { assertSameOrigin } from "./route-handler";

const APP = () => "http://localhost:3100";

function req(method: string, headers: Record<string, string> = {}, body?: string) {
  return new Request("http://localhost:3100/api/v1/x", { method, headers, body });
}

describe("same-origin check for mutations", () => {
  it("allows same-origin and non-browser mutations, and all reads", () => {
    expect(() =>
      assertSameOrigin(req("POST", { origin: "http://localhost:3100" }), APP),
    ).not.toThrow();
    expect(() => assertSameOrigin(req("DELETE"), APP)).not.toThrow();
    expect(() =>
      assertSameOrigin(req("GET", { origin: "https://evil.example" }), APP),
    ).not.toThrow();
  });

  it("refuses cross-origin or cross-site browser mutations", () => {
    expect(() =>
      assertSameOrigin(req("POST", { origin: "https://evil.example" }), APP),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => assertSameOrigin(req("PATCH", { "sec-fetch-site": "cross-site" }), APP)).toThrow();
  });
});

describe("request body", () => {
  it("parses JSON within the limit", async () => {
    const body = await readJsonBody(req("POST", { "content-type": "application/json" }, '{"a":1}'));
    expect(body).toEqual({ a: 1 });
  });

  it("rejects wrong content types, malformed JSON and oversized bodies", async () => {
    await expect(
      readJsonBody(req("POST", { "content-type": "text/plain" }, "{}")),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    await expect(
      readJsonBody(req("POST", { "content-type": "application/json" }, "{")),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      readJsonBody(
        req("POST", { "content-type": "application/json" }, JSON.stringify({ x: "y".repeat(100) })),
        50,
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});

describe("pagination and sorting", () => {
  it("whitelists sort fields and appends a stable id tie-breaker", () => {
    const schema = sortSchema(["name", "updatedAt"], "-updatedAt");
    expect(schema.parse(undefined)).toEqual([{ updatedAt: "desc" }, { id: "asc" }]);
    expect(schema.parse("name")).toEqual([{ name: "asc" }, { id: "asc" }]);
    expect(schema.safeParse("password").success).toBe(false);
  });

  it("computes page info", () => {
    expect(paginated([1, 2], 45, { page: 2, pageSize: 20 }).page).toEqual({
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
    expect(paginated([], 0, { page: 1, pageSize: 20 }).page.totalPages).toBe(1);
  });

  it("drops empty query values", () => {
    expect(searchParamsToObject(new URLSearchParams("q=&status=idea"))).toEqual({ status: "idea" });
  });

  it("treats malformed ids as not found", () => {
    expect(() => parseId("../etc")).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
    const id = crypto.randomUUID();
    expect(parseId(id.toUpperCase())).toBe(id);
  });
});

describe("database error mapping", () => {
  const known = (code: string) =>
    new Prisma.PrismaClientKnownRequestError("db detail: constraint users_pkey", {
      code,
      clientVersion: "7",
    });

  it("maps unique, FK and not-found errors without leaking details", () => {
    expect(mapDatabaseError(known("P2002"))).toMatchObject({ code: "CONFLICT" });
    expect(mapDatabaseError(known("P2003"))).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mapDatabaseError(known("P2025"))).toMatchObject({ code: "NOT_FOUND" });
    expect((mapDatabaseError(known("P2002")) as Error).message).not.toContain("users_pkey");
    expect(mapDatabaseError(new Error('new row violates check constraint "x"'))).toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const other = new Error("boom");
    expect(mapDatabaseError(other)).toBe(other);
  });

  it("escapes LIKE wildcards", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
    expect(z.string().parse(escapeLike("plain"))).toBe("plain");
  });
});
