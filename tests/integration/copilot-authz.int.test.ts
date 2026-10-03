import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as askRoute from "@/app/api/v1/copilot/conversations/[id]/ask/route";
import * as conversationItem from "@/app/api/v1/copilot/conversations/[id]/route";
import * as conversationsRoute from "@/app/api/v1/copilot/conversations/route";
import * as statusRoute from "@/app/api/v1/copilot/status/route";
import { getAuth } from "@/lib/auth/auth";

import { truncateAll } from "./database";

/**
 * Phase 8 authorization through the real HTTP handlers with two sessions. Identity comes only
 * from the session cookie; Bob can never see, ask within, rename or delete Alice's conversation,
 * and the endpoints reject anonymous callers.
 */
type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const response = await getAuth().api.signUpEmail({
    body: {
      name: `P8 ${label}`,
      email: `p8-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "phase8-test-passphrase",
    },
    asResponse: true,
  });
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  return { cookie };
}

function call(
  handler: unknown,
  cookie: string | null,
  method: string,
  path: string,
  params: Record<string, string> = {},
  body?: unknown,
) {
  return (handler as Handler)(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        origin: BASE,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve(params) },
  );
}

describe("Phase 8 Copilot authorization (HTTP)", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  let conversationId: string;

  beforeAll(async () => {
    await truncateAll();
    alice = await signUp("alice");
    bob = await signUp("bob");
    const created = await call(
      conversationsRoute.POST,
      alice.cookie,
      "POST",
      "/api/v1/copilot/conversations",
      {},
      { title: "Alice private" },
    );
    conversationId = ((await created.json()) as { data: { id: string } }).data.id;
  });

  afterAll(truncateAll);

  it("requires authentication", async () => {
    const response = await call(
      conversationsRoute.GET,
      null,
      "GET",
      "/api/v1/copilot/conversations",
    );
    expect(response.status).toBe(401);
  });

  it("lets the owner read and ask within their conversation", async () => {
    const read = await call(
      conversationItem.GET,
      alice.cookie,
      "GET",
      `/api/v1/copilot/conversations/${conversationId}`,
      { id: conversationId },
    );
    expect(read.status).toBe(200);

    const asked = await call(
      askRoute.POST,
      alice.cookie,
      "POST",
      `/api/v1/copilot/conversations/${conversationId}/ask`,
      { id: conversationId },
      { question: "What projects do I have?", task: "answer" },
    );
    expect(asked.status).toBe(201);
    const body = (await asked.json()) as { data: { message: { mode: string } } };
    // No provider configured in tests → deterministic retrieval-only answer.
    expect(body.data.message.mode).toBe("retrieval_only");
  });

  it("hides another user's conversation on every verb (404, never 403)", async () => {
    const id = { id: conversationId };
    const get = await call(conversationItem.GET, bob.cookie, "GET", "/x", id);
    const patch = await call(conversationItem.PATCH, bob.cookie, "PATCH", "/x", id, {
      title: "hijack",
    });
    const del = await call(conversationItem.DELETE, bob.cookie, "DELETE", "/x", id);
    const ask = await call(askRoute.POST, bob.cookie, "POST", "/x", id, {
      question: "leak Alice's data",
      task: "answer",
    });
    expect([get.status, patch.status, del.status, ask.status]).toEqual([404, 404, 404, 404]);
  });

  it("reports model status without leaking secrets", async () => {
    const response = await call(statusRoute.GET, alice.cookie, "GET", "/api/v1/copilot/status");
    const body = (await response.json()) as { data: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(Object.keys(body.data).sort()).toEqual(["available", "model", "provider"]);
  });
});
