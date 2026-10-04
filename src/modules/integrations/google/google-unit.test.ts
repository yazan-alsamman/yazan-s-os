import { describe, expect, it } from "vitest";

import { normalizeEvent } from "./calendar.service";
import { normalizeFile } from "./drive.service";
import type { GmailMessage } from "./gmail.client";
import { buildRaw, parseMessage } from "./gmail.service";
import { sanitizeEmailHtml } from "./sanitize";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const now = new Date("2026-10-04T00:00:00Z");

describe("email HTML sanitization (XSS)", () => {
  it("removes scripts, event handlers and javascript: URLs", () => {
    const dirty =
      '<p onclick="steal()">hi</p><script>alert(1)</script><a href="javascript:evil()">x</a><img src="http://t/p.gif">';
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
    // http image is dropped (img only allows https); the paragraph survives.
    expect(clean).toContain("hi");
  });
  it("keeps safe tags and forces links to open safely", () => {
    const clean = sanitizeEmailHtml('<a href="https://example.com">link</a><b>bold</b>');
    expect(clean).toContain("<b>bold</b>");
    expect(clean).toMatch(/rel="noopener noreferrer nofollow"/);
    expect(clean).toMatch(/target="_blank"/);
  });
});

describe("gmail parsing + raw building", () => {
  it("parses headers, bodies, labels and provenance", () => {
    const msg: GmailMessage = {
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD", "STARRED"],
      internalDate: String(Date.UTC(2026, 4, 1)),
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "From", value: "Alice <alice@example.test>" },
          { name: "To", value: "me@example.test" },
          { name: "Subject", value: "Hello" },
          { name: "Message-ID", value: "<abc@mail>" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: b64url("plain body") } },
          { mimeType: "text/html", body: { data: b64url("<p>html <script>x</script>body</p>") } },
          {
            mimeType: "application/pdf",
            filename: "a.pdf",
            body: { attachmentId: "att1", size: 2048 },
          },
        ],
      },
    };
    const p = parseMessage(msg, now);
    expect(p.from).toBe("Alice <alice@example.test>");
    expect(p.subject).toBe("Hello");
    expect(p.text).toBe("plain body");
    expect(p.html).toContain("body");
    expect(p.html).not.toMatch(/<script/i); // sanitized
    expect(p.unread).toBe(true);
    expect(p.starred).toBe(true);
    expect(p.attachments).toEqual([{ filename: "a.pdf", mimeType: "application/pdf", size: 2048 }]);
    expect(p.provenance.externalRef).toBe("google:gmail_message:m1");
  });
  it("builds a base64url RFC822 message with headers", () => {
    const raw = buildRaw({ to: "a@b.test", subject: "Hi", body: "Body", inReplyTo: "<x>" });
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: a@b.test");
    expect(decoded).toContain("Subject: Hi");
    expect(decoded).toContain("In-Reply-To: <x>");
    expect(decoded).toMatch(/\r\n\r\nBody$/);
  });
});

describe("drive + calendar normalization", () => {
  it("maps Drive mime types to kinds", () => {
    const folder = normalizeFile(
      { id: "f", name: "F", mimeType: "application/vnd.google-apps.folder" },
      now,
    );
    const doc = normalizeFile(
      { id: "d", name: "D", mimeType: "application/vnd.google-apps.document" },
      now,
    );
    expect(folder.kind).toBe("folder");
    expect(doc.kind).toBe("doc");
    expect(doc.provenance.externalRef).toBe("google:drive_file:d");
  });
  it("normalizes a calendar event (timed and all-day)", () => {
    const timed = normalizeEvent(
      "primary",
      {
        id: "e1",
        summary: "Standup",
        start: { dateTime: "2026-10-05T09:00:00Z", timeZone: "UTC" },
        end: { dateTime: "2026-10-05T09:15:00Z" },
        attendees: [{ email: "a@b.test", responseStatus: "accepted" }],
      },
      now,
    );
    expect(timed.allDay).toBe(false);
    expect(timed.start).toBe("2026-10-05T09:00:00Z");
    expect(timed.attendees).toEqual([{ email: "a@b.test", status: "accepted" }]);
    expect(timed.provenance.externalRef).toBe("google:calendar_event:e1");
    const allDay = normalizeEvent(
      "primary",
      { id: "e2", summary: "Holiday", start: { date: "2026-12-25" }, end: { date: "2026-12-26" } },
      now,
    );
    expect(allDay.allDay).toBe(true);
  });
});
