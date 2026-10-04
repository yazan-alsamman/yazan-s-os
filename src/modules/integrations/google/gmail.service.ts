import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/modules/shared/service-context";

import type { IntegrationDeps } from "../integration.service";
import { provenanceOf } from "../provenance";

import { createGmailClient, type GmailMessage, type GmailPart } from "./gmail.client";
import { createGoogleClient } from "./google.client";
import { sanitizeEmailHtml, textSnippet } from "./sanitize";

/**
 * Gmail service. Reads threads/messages and performs ONLY explicit mutations (modify labels,
 * archive, star, mark read, draft, send). Gmail remains the source of truth; message bodies are
 * fetched live, never cached. HTML is sanitized before it leaves the server. Nothing is ever sent,
 * archived or modified as a side effect of reading.
 */
const PROVIDER = "google" as const;

function b64urlDecode(data?: string): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}
function headerOf(part: GmailPart | undefined, name: string): string | null {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}
interface Bodies {
  text: string;
  html: string;
  attachments: { filename: string; mimeType: string; size: number }[];
}
function collectBodies(part: GmailPart | undefined, acc: Bodies): Bodies {
  if (!part) return acc;
  const mt = part.mimeType ?? "";
  if (part.filename && part.body?.attachmentId) {
    acc.attachments.push({ filename: part.filename, mimeType: mt, size: part.body.size ?? 0 });
  } else if (mt === "text/plain" && part.body?.data) {
    acc.text += b64urlDecode(part.body.data);
  } else if (mt === "text/html" && part.body?.data) {
    acc.html += b64urlDecode(part.body.data);
  }
  for (const p of part.parts ?? []) collectBodies(p, acc);
  return acc;
}

export function parseMessage(msg: GmailMessage, now: Date) {
  const { text, html, attachments } = collectBodies(msg.payload, {
    text: "",
    html: "",
    attachments: [],
  });
  const labels = msg.labelIds ?? [];
  const date = msg.internalDate ? new Date(Number(msg.internalDate)) : null;
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: headerOf(msg.payload, "From"),
    to: headerOf(msg.payload, "To"),
    cc: headerOf(msg.payload, "Cc"),
    subject: headerOf(msg.payload, "Subject"),
    messageIdHeader: headerOf(msg.payload, "Message-ID"),
    references: headerOf(msg.payload, "References"),
    date: date?.toISOString() ?? null,
    snippet: msg.snippet ?? textSnippet(text),
    text: text || null,
    html: html ? sanitizeEmailHtml(html) : null,
    attachments,
    unread: labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    labelIds: labels,
    provenance: provenanceOf({
      provider: PROVIDER,
      resourceType: "gmail_message",
      externalId: msg.id,
      sourceUrl: null,
      observedAt: now,
      lastSyncedAt: now,
    }),
  };
}

/** Build an RFC 822 message as Gmail base64url `raw`. */
export function buildRaw(input: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [`To: ${input.to}`];
  if (input.cc) lines.push(`Cc: ${input.cc}`);
  lines.push(`Subject: ${input.subject}`);
  if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) lines.push(`References: ${input.references}`);
  lines.push(
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    input.body,
  );
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export function createGmailService(db: PrismaClient, deps: IntegrationDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const api = (ctx: ServiceContext) => createGmailClient(createGoogleClient(db, ctx, deps));
  const audit = (ctx: ServiceContext, verb: string, entityId: string | null) =>
    db.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: `email.${verb}`,
        entityType: "email",
        entityId,
        requestId: ctx.requestId,
      },
    });

  return {
    async listThreads(
      ctx: ServiceContext,
      query: { label?: string; q?: string; pageToken?: string; maxResults?: number },
    ) {
      const gmail = api(ctx);
      const max = Math.min(Math.max(query.maxResults ?? 15, 1), 25);
      const page = await gmail.listThreads({
        q: query.q,
        labelIds: query.label && query.label !== "SEARCH" ? query.label : undefined,
        pageToken: query.pageToken,
        maxResults: max,
      });
      const at = now();
      const threads = await Promise.all(
        (page.threads ?? []).map(async (t) => {
          const full = await gmail.getThread(t.id);
          const messages = (full.messages ?? []).map((m) => parseMessage(m, at));
          const last = messages.at(-1);
          return {
            id: t.id,
            snippet: t.snippet ?? last?.snippet ?? "",
            from: last?.from ?? null,
            subject: last?.subject ?? null,
            date: last?.date ?? null,
            messageCount: messages.length,
            unread: messages.some((m) => m.unread),
            starred: messages.some((m) => m.starred),
          };
        }),
      );
      return {
        data: threads,
        nextPageToken: page.nextPageToken ?? null,
        fetchedAt: at.toISOString(),
      };
    },

    async getThread(ctx: ServiceContext, id: string) {
      const full = await api(ctx).getThread(id);
      const at = now();
      return {
        id,
        messages: (full.messages ?? []).map((m) => parseMessage(m, at)),
        fetchedAt: at.toISOString(),
      };
    },

    async listLabels(ctx: ServiceContext) {
      const res = await api(ctx).listLabels();
      return (res.labels ?? [])
        .filter((l) => l.id && l.name)
        .map((l) => ({ id: l.id, name: l.name, type: l.type ?? "user" }));
    },

    async modify(
      ctx: ServiceContext,
      messageId: string,
      change: {
        star?: boolean;
        read?: boolean;
        archive?: boolean;
        addLabelIds?: string[];
        removeLabelIds?: string[];
      },
    ) {
      const add = new Set(change.addLabelIds ?? []);
      const remove = new Set(change.removeLabelIds ?? []);
      if (change.star === true) add.add("STARRED");
      if (change.star === false) remove.add("STARRED");
      if (change.read === true) remove.add("UNREAD");
      if (change.read === false) add.add("UNREAD");
      if (change.archive) remove.add("INBOX");
      const msg = await api(ctx).modifyMessage(messageId, {
        addLabelIds: [...add],
        removeLabelIds: [...remove],
      });
      await audit(ctx, change.archive ? "archived" : "modified", messageId);
      return parseMessage(msg, now());
    },

    /** Send an email. Only ever called from an explicit, confirmed user action. */
    async send(
      ctx: ServiceContext,
      input: {
        to: string;
        cc?: string;
        subject: string;
        body: string;
        inReplyTo?: string;
        references?: string;
      },
    ) {
      const raw = buildRaw(input);
      const res = await api(ctx).send(raw);
      await audit(ctx, "sent", res.id ?? null);
      return { id: res.id, threadId: res.threadId };
    },

    async saveDraft(
      ctx: ServiceContext,
      input: { to: string; cc?: string; subject: string; body: string; threadId?: string },
    ) {
      const raw = buildRaw(input);
      const res = await api(ctx).createDraft(raw, input.threadId);
      await audit(ctx, "draft_created", res.id ?? null);
      return { id: res.id };
    },
  };
}
