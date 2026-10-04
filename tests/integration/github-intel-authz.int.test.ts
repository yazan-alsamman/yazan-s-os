import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as analyticsRoute from "@/app/api/v1/github/analytics/route";
import * as overviewRoute from "@/app/api/v1/github/overview/route";
import * as reposRoute from "@/app/api/v1/github/repos/route";
import { getAuth } from "@/lib/auth/auth";

import { truncateAll } from "./database";

/** Phase 9.6 GitHub intelligence routes: authentication + owner-scoping (session-derived identity). */
type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const res = await getAuth().api.signUpEmail({
    body: {
      name: `P96 ${label}`,
      email: `p96-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "phase96-test-passphrase",
    },
    asResponse: true,
  });
  return { cookie: (res.headers.get("set-cookie") ?? "").split(";")[0]! };
}
const call = (h: unknown, cookie: string | null, path: string) =>
  (h as Handler)(new Request(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }), {
    params: Promise.resolve({}),
  });

describe("Phase 9.6 GitHub intelligence authorization (HTTP)", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  beforeAll(async () => {
    await truncateAll();
    alice = await signUp("alice");
  });
  afterAll(truncateAll);

  it("requires authentication", async () => {
    expect((await call(overviewRoute.GET, null, "/api/v1/github/overview?range=90d")).status).toBe(
      401,
    );
    expect((await call(reposRoute.GET, null, "/api/v1/github/repos")).status).toBe(401);
  });

  it("refuses GitHub intelligence without a connection (owner-scoped)", async () => {
    for (const [h, p] of [
      [overviewRoute.GET, "/api/v1/github/overview?range=90d"],
      [analyticsRoute.GET, "/api/v1/github/analytics?range=90d"],
      [reposRoute.GET, "/api/v1/github/repos"],
    ] as const) {
      const res = await call(h, alice.cookie, p);
      expect(res.status).toBe(409);
      expect(((await res.json()) as { code: string }).code).toBe("INTEGRATION_NOT_CONNECTED");
    }
  });

  it("ignores an injected userId in the query", async () => {
    const res = await call(
      overviewRoute.GET,
      alice.cookie,
      "/api/v1/github/overview?range=90d&userId=someone-else",
    );
    // Still resolves to Alice (who has no connection) → 409, never another user's data.
    expect(res.status).toBe(409);
  });
});
