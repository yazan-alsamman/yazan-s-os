import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as reposRoute from "@/app/api/v1/github/repositories/route";
import * as connectionItem from "@/app/api/v1/integrations/[id]/route";
import * as connectRoute from "@/app/api/v1/integrations/connect/[provider]/route";
import * as providersRoute from "@/app/api/v1/integrations/providers/route";
import * as integrationsRoute from "@/app/api/v1/integrations/route";
import { getAuth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";

import { truncateAll } from "./database";

/** Phase 9.5 authorization via the real HTTP handlers with two sessions. */
type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const response = await getAuth().api.signUpEmail({
    body: {
      name: `P95 ${label}`,
      email: `p95-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "phase95-test-passphrase",
    },
    asResponse: true,
  });
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  const { user } = (await response.json()) as { user: { id: string } };
  return { cookie, userId: user.id };
}

function call(
  handler: unknown,
  cookie: string | null,
  method: string,
  path: string,
  params: Record<string, string> = {},
) {
  return (handler as Handler)(
    new Request(`${BASE}${path}`, { method, headers: cookie ? { cookie } : {} }),
    { params: Promise.resolve(params) },
  );
}

describe("Phase 9.5 integration authorization (HTTP)", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  let aliceConnId: string;

  beforeAll(async () => {
    await truncateAll();
    alice = await signUp("alice");
    bob = await signUp("bob");
    const row = await getDb().integrationConnection.create({
      data: {
        userId: alice.userId,
        provider: "github",
        externalAccountId: "42",
        displayName: "octo",
        accountLogin: "octo",
        status: "connected",
        accessTokenEnc: "enc",
        scopes: ["read:user", "repo"],
        capabilities: ["repositories"],
      },
    });
    aliceConnId = row.id;
  });
  afterAll(truncateAll);

  it("requires authentication", async () => {
    expect((await call(integrationsRoute.GET, null, "GET", "/api/v1/integrations")).status).toBe(
      401,
    );
  });

  it("lists providers for an authenticated user (no secrets)", async () => {
    const res = await call(
      providersRoute.GET,
      alice.cookie,
      "GET",
      "/api/v1/integrations/providers",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { provider: string; configured: boolean }[] };
    const github = body.data.find((p) => p.provider === "github");
    expect(github?.configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain("test-github-secret");
  });

  it("returns an authorize URL on connect (no token involved)", async () => {
    const res = await call(
      connectRoute.POST,
      alice.cookie,
      "POST",
      "/api/v1/integrations/connect/github",
      {
        provider: "github",
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { authorizeUrl: string } };
    expect(body.data.authorizeUrl).toContain("github.com/login/oauth/authorize");
  });

  it("hides another user's connection (404) and never leaks the token", async () => {
    const own = await call(connectionItem.GET, alice.cookie, "GET", "/x", { id: aliceConnId });
    expect(own.status).toBe(200);
    expect(JSON.stringify(await own.json())).not.toContain("enc");
    const foreign = await call(connectionItem.GET, bob.cookie, "GET", "/x", { id: aliceConnId });
    expect(foreign.status).toBe(404);
    const del = await call(connectionItem.DELETE, bob.cookie, "DELETE", "/x", { id: aliceConnId });
    expect(del.status).toBe(404);
  });

  it("refuses GitHub resource access without a connection", async () => {
    const res = await call(reposRoute.GET, bob.cookie, "GET", "/api/v1/github/repositories");
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INTEGRATION_NOT_CONNECTED");
  });
});
