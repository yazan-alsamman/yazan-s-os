import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors/app-error";

import { defineRoute } from "./route-handler";

const noParams = { params: Promise.resolve({}) };

describe("defineRoute", () => {
  it("serialises returned data as JSON with request id and no-store caching", async () => {
    const GET = defineRoute("test.ok", async () => ({ data: { ok: true } }));
    const response = await GET(
      new Request("http://localhost/api/x", { headers: { "x-request-id": "req-12345678" } }),
      noParams,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req-12345678");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ data: { ok: true } });
  });

  it("maps AppErrors to the standard error envelope", async () => {
    const GET = defineRoute("test.unauth", async () => {
      throw new AppError("UNAUTHENTICATED");
    });
    const response = await GET(new Request("http://localhost/api/x"), noParams);
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(401);
    expect(body).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication is required.",
      requestId: response.headers.get("x-request-id"),
    });
  });

  it("hides unexpected failures behind INTERNAL_ERROR", async () => {
    const GET = defineRoute("test.crash", async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'secretColumn')");
    });
    const response = await GET(new Request("http://localhost/api/x"), noParams);
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).toContain("INTERNAL_ERROR");
    expect(text).not.toContain("secretColumn");
  });
});
