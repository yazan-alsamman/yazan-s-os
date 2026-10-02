import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getAuth } from "@/lib/auth/auth";
import { requireApiUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AuditAction } from "@/modules/audit/audit.service";

import { truncateAll } from "./database";

const PASSWORD = "integration-test-passphrase";

function newEmail() {
  return `auth-${crypto.randomUUID()}@peos-test.invalid`;
}

async function signUp(email: string) {
  const response = await getAuth().api.signUpEmail({
    body: { name: "Integration User", email, password: PASSWORD },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie") ?? "";
  return { cookie: cookie.split(";")[0]! };
}

describe("Better Auth persistence", () => {
  beforeEach(truncateAll);
  afterAll(() => getDb().$disconnect());

  it("creates user, hashed credential and session rows on sign-up", async () => {
    const email = newEmail();
    await signUp(email);

    const user = await getDb().user.findUniqueOrThrow({ where: { email } });
    const account = await getDb().account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.providerId).toBe("credential");
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(PASSWORD);
    expect(await getDb().session.count({ where: { userId: user.id } })).toBe(1);
  });

  it("records audit events for user and session creation", async () => {
    const email = newEmail();
    await signUp(email);
    const user = await getDb().user.findUniqueOrThrow({ where: { email } });

    const actions = (await getDb().auditLog.findMany({ where: { actorId: user.id } })).map(
      (e) => e.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([AuditAction.UserCreated, AuditAction.SessionCreated]),
    );
    const payloads = JSON.stringify(await getDb().auditLog.findMany());
    expect(payloads).not.toContain(PASSWORD);
  });

  it("validates sessions server-side and rejects forged or revoked cookies", async () => {
    const { cookie } = await signUp(newEmail());
    const request = (c: string) =>
      new Request("http://localhost:3100/api/v1/me", { headers: { cookie: c } });

    await expect(requireApiUser(request(cookie))).resolves.toMatchObject({
      email: expect.stringContaining("@peos-test.invalid"),
    });
    await expect(
      requireApiUser(request("better-auth.session_token=forged.value")),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    await getAuth().api.signOut({ headers: new Headers({ cookie }) });
    await expect(requireApiUser(request(cookie))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("rejects a wrong password", async () => {
    const email = newEmail();
    await signUp(email);
    const response = await getAuth().api.signInEmail({
      body: { email, password: "definitely-not-the-password" },
      asResponse: true,
    });
    expect(response.status).toBe(401);
  });

  it("rejects passwords below the policy minimum", async () => {
    const response = await getAuth().api.signUpEmail({
      body: { name: "Short", email: newEmail(), password: "short" },
      asResponse: true,
    });
    expect(response.status).toBe(400);
  });
});
