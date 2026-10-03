import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as engineeringRoute from "@/app/api/v1/analytics/engineering/route";
import { getAuth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";

import { truncateAll } from "./database";

/**
 * Phase 9 authorization for the Engineering Analytics endpoint. Identity comes only from the
 * session; an injected userId is ignored, anonymous callers are rejected, and one user never sees
 * another's activity.
 */
type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const response = await getAuth().api.signUpEmail({
    body: {
      name: `P9 ${label}`,
      email: `p9-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "phase9-test-passphrase",
    },
    asResponse: true,
  });
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  const { user } = (await response.json()) as { user: { id: string } };
  return { cookie, userId: user.id };
}

function call(cookie: string | null, path: string) {
  return (engineeringRoute.GET as Handler)(
    new Request(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }),
    { params: Promise.resolve({}) },
  );
}
const activityOf = async (r: Response) =>
  ((await r.json()) as { data: { activity: { value: number | null } } }).data.activity.value;

describe("Phase 9 Engineering Analytics authorization (HTTP)", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;

  beforeAll(async () => {
    await truncateAll();
    alice = await signUp("alice");
    bob = await signUp("bob");
    const db = getDb();
    const today = new Date();
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 5),
    );
    // Alice has two completed projects; Bob has none.
    for (const name of ["A1", "A2"]) {
      await db.project.create({
        data: {
          userId: alice.userId,
          name,
          slug: `p-${crypto.randomUUID()}`,
          status: "production",
          completedAt: date,
        },
      });
    }
  });

  afterAll(truncateAll);

  it("requires authentication", async () => {
    expect((await call(null, "/api/v1/analytics/engineering")).status).toBe(401);
  });

  it("returns only the caller's own activity", async () => {
    expect(
      await activityOf(await call(alice.cookie, "/api/v1/analytics/engineering?range=90d")),
    ).toBe(2);
    expect(
      await activityOf(await call(bob.cookie, "/api/v1/analytics/engineering?range=90d")),
    ).toBeNull();
  });

  it("ignores an injected userId / ownerId and never adopts another user's data", async () => {
    const value = await activityOf(
      await call(
        bob.cookie,
        `/api/v1/analytics/engineering?range=90d&userId=${alice.userId}&ownerId=${alice.userId}`,
      ),
    );
    // Bob still sees his own (no-data) activity, never Alice's 2.
    expect(value).toBeNull();
  });

  it("rejects invalid query parameters", async () => {
    expect((await call(alice.cookie, "/api/v1/analytics/engineering?range=nonsense")).status).toBe(
      400,
    );
    expect(
      (await call(alice.cookie, "/api/v1/analytics/engineering?range=custom&from=2026-01-01"))
        .status,
    ).toBe(400);
  });
});
