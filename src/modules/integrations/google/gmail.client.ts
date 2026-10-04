import "server-only";

import type { GoogleClient } from "./google.client";

/**
 * Gmail REST adapter (Gmail API v1) over the shared authorized Google client. Thin: it only issues
 * requests; parsing/normalization happens in the service. Reads and explicit mutations only — no
 * automatic sends or modifications.
 */
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailHeader {
  name: string;
  value: string;
}
export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}
export interface GmailThread {
  id: string;
  snippet?: string;
  messages?: GmailMessage[];
}
export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

export function createGmailClient(google: GoogleClient) {
  return {
    listThreads(opts: { q?: string; labelIds?: string; pageToken?: string; maxResults: number }) {
      return google.get<{ threads?: { id: string; snippet?: string }[]; nextPageToken?: string }>(
        `${BASE}/threads${qs({ q: opts.q, labelIds: opts.labelIds, pageToken: opts.pageToken, maxResults: opts.maxResults })}`,
      );
    },
    getThread(id: string) {
      return google.get<GmailThread>(`${BASE}/threads/${id}${qs({ format: "full" })}`);
    },
    listLabels() {
      return google.get<{ labels?: GmailLabel[] }>(`${BASE}/labels`);
    },
    modifyMessage(id: string, body: { addLabelIds?: string[]; removeLabelIds?: string[] }) {
      return google.post<GmailMessage>(`${BASE}/messages/${id}/modify`, body);
    },
    send(raw: string) {
      return google.post<{ id: string; threadId: string }>(`${BASE}/messages/send`, { raw });
    },
    createDraft(raw: string, threadId?: string) {
      return google.post<{ id: string; message?: { id: string } }>(`${BASE}/drafts`, {
        message: { raw, ...(threadId ? { threadId } : {}) },
      });
    },
  };
}

export type GmailClient = ReturnType<typeof createGmailClient>;
