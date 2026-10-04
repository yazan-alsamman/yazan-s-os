import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { createCalendarService } from "@/modules/integrations/google/calendar.service";
import { createDriveService } from "@/modules/integrations/google/drive.service";
import { createGmailService } from "@/modules/integrations/google/gmail.service";
import { createIntegrationService } from "@/modules/integrations/integration.service";
import type { ServiceContext } from "@/modules/shared/service-context";

import { contextFor, createTestUser, truncateAll } from "./database";

/**
 * Phase 9.5+ Google connectors against a mocked Google API: OAuth connect + token refresh, Gmail
 * read + mutations (send/modify), Drive read, Calendar read + create/cancel, audit, and isolation.
 */
const db = getDb();
const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const json = (b: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(b), {
    status,
    headers: { "content-type": "application/json" },
  });

let refreshed = false;
const googleFetch = (async (input: string | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  const method = init?.method ?? "GET";
  if (url.includes("oauth2.googleapis.com/token")) {
    const body = String(init?.body ?? "");
    if (body.includes("grant_type=refresh_token")) {
      refreshed = true;
      return json({ access_token: "ya29.refreshed", expires_in: 3600 });
    }
    return json({
      access_token: "ya29.initial",
      refresh_token: "1//refresh",
      expires_in: 3600,
      scope: "openid email",
    });
  }
  if (url.includes("openidconnect.googleapis.com/v1/userinfo")) {
    return json({ sub: "google-123", email: "me@example.test", name: "Me" });
  }
  // Gmail
  if (/\/threads\/[^/?]+/.test(url)) {
    return json({
      id: "t1",
      messages: [
        {
          id: "m1",
          threadId: "t1",
          labelIds: ["INBOX", "UNREAD"],
          internalDate: String(Date.UTC(2026, 4, 1)),
          payload: {
            headers: [
              { name: "From", value: "a@b.test" },
              { name: "Subject", value: "Hi" },
            ],
            parts: [{ mimeType: "text/plain", body: { data: b64url("hello") } }],
          },
        },
      ],
    });
  }
  if (url.includes("/threads")) return json({ threads: [{ id: "t1", snippet: "hello" }] });
  if (url.includes("/labels"))
    return json({ labels: [{ id: "INBOX", name: "Inbox", type: "system" }] });
  if (url.includes("/messages/") && url.includes("/modify"))
    return json({ id: "m1", labelIds: ["INBOX"] });
  if (url.includes("/messages/send")) return json({ id: "sent1", threadId: "t9" });
  // Drive
  if (url.includes("drive/v3/files")) {
    return json({
      files: [
        {
          id: "file1",
          name: "Doc",
          mimeType: "application/vnd.google-apps.document",
          webViewLink: "https://docs.google/x",
        },
      ],
    });
  }
  // Calendar
  if (url.includes("/users/me/calendarList"))
    return json({ items: [{ id: "primary", summary: "Me", primary: true }] });
  if (url.includes("/events") && method === "POST")
    return json({
      id: "ev1",
      summary: "New",
      start: { dateTime: "2026-10-05T09:00:00Z" },
      end: { dateTime: "2026-10-05T10:00:00Z" },
    });
  if (/\/events\/[^/?]+/.test(url) && method === "DELETE") return json(null, 204);
  if (url.includes("/events"))
    return json({
      items: [
        {
          id: "ev0",
          summary: "Standup",
          start: { dateTime: "2026-10-04T09:00:00Z" },
          end: { dateTime: "2026-10-04T09:15:00Z" },
        },
      ],
    });
  return json({ error: "not found" }, 404);
}) as unknown as typeof fetch;

const deps = { fetchImpl: googleFetch };
const integ = () => createIntegrationService(db, deps);

async function connectGoogle(ctx: ServiceContext) {
  const { authorizeUrl } = await integ().startConnect(ctx, "google");
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  await integ().handleCallback(ctx, "google", { code: "c", state });
}

describe("Phase 9.5+ Google connectors (service + database)", () => {
  let alice: ServiceContext;
  let bob: ServiceContext;
  beforeAll(async () => {
    await truncateAll();
    alice = contextFor(await createTestUser("g-alice"));
    bob = contextFor(await createTestUser("g-bob"));
    await connectGoogle(alice);
  });
  afterAll(truncateAll);

  it("connects Google and stores an encrypted refresh token", async () => {
    const row = await db.integrationConnection.findFirstOrThrow({
      where: { userId: alice.userId, provider: "google" },
    });
    expect(row.status).toBe("connected");
    expect(row.accountEmail).toBe("me@example.test");
    expect(row.refreshTokenEnc).toBeTruthy();
    expect(row.refreshTokenEnc).not.toContain("1//refresh");
  });

  it("reads Gmail threads and a thread (HTML sanitized, bodies not cached)", async () => {
    const list = await createGmailService(db, deps).listThreads(alice, { label: "INBOX" });
    expect(list.data[0]!.subject).toBe("Hi");
    expect(list.data[0]!.unread).toBe(true);
    const thread = await createGmailService(db, deps).getThread(alice, "t1");
    expect(thread.messages[0]!.text).toBe("hello");
  });

  it("sends email and modifies a message only on explicit action, with audit", async () => {
    const svc = createGmailService(db, deps);
    const sent = await svc.send(alice, { to: "x@y.test", subject: "S", body: "B" });
    expect(sent.id).toBe("sent1");
    await svc.modify(alice, "m1", { star: true });
    const actions = (await db.auditLog.findMany({ where: { actorId: alice.userId } })).map(
      (a) => a.action,
    );
    expect(actions).toContain("email.sent");
    expect(actions).toContain("email.modified");
  });

  it("refreshes an expired Google token transparently", async () => {
    refreshed = false;
    await db.integrationConnection.updateMany({
      where: { userId: alice.userId, provider: "google" },
      data: { tokenExpiresAt: new Date(Date.now() - 60_000) },
    });
    await createDriveService(db, deps).listFiles(alice, {});
    expect(refreshed).toBe(true);
  });

  it("reads Drive files", async () => {
    const files = await createDriveService(db, deps).listFiles(alice, {});
    expect(files.data[0]!.kind).toBe("doc");
    expect(files.data[0]!.provenance.externalRef).toBe("google:drive_file:file1");
  });

  it("reads calendars/events and creates + cancels an event (audited)", async () => {
    const cal = createCalendarService(db, deps);
    expect((await cal.listCalendars(alice))[0]!.primary).toBe(true);
    const events = await cal.listEvents(alice, {
      timeMin: "2026-10-01T00:00:00Z",
      timeMax: "2026-10-31T00:00:00Z",
    });
    expect(events.data[0]!.summary).toBe("Standup");
    const created = await cal.createEvent(alice, "primary", {
      summary: "New",
      start: "2026-10-05T09:00:00Z",
      end: "2026-10-05T10:00:00Z",
    });
    expect(created.externalId).toBe("ev1");
    await cal.cancelEvent(alice, "primary", "ev1");
    const actions = (await db.auditLog.findMany({ where: { actorId: alice.userId } })).map(
      (a) => a.action,
    );
    expect(actions).toContain("calendar.event_created");
    expect(actions).toContain("calendar.event_cancelled");
  });

  it("isolates connectors — Bob has no Google connection", async () => {
    await expect(createGmailService(db, deps).listThreads(bob, {})).rejects.toMatchObject({
      code: "INTEGRATION_NOT_CONNECTED",
    });
    await expect(createCalendarService(db, deps).listCalendars(bob)).rejects.toMatchObject({
      code: "INTEGRATION_NOT_CONNECTED",
    });
  });
});
