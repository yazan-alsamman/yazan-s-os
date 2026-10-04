"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson, sendJson, withQuery, type ApiError } from "@/lib/http/fetch-json";

/** Client hooks for the Gmail / Drive / Calendar connectors (Phase 9.5+). */
const KEY = "google";
type Params = Record<string, string | number | boolean | undefined>;

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

// ── Gmail ────────────────────────────────────────────────────────────────────
export interface ThreadSummary {
  id: string;
  snippet: string;
  from: string | null;
  subject: string | null;
  date: string | null;
  messageCount: number;
  unread: boolean;
  starred: boolean;
}
export interface MailMessage {
  id: string;
  threadId: string;
  from: string | null;
  to: string | null;
  cc: string | null;
  subject: string | null;
  messageIdHeader: string | null;
  references: string | null;
  date: string | null;
  snippet: string;
  text: string | null;
  html: string | null;
  attachments: { filename: string; mimeType: string; size: number }[];
  unread: boolean;
  starred: boolean;
  provenance: { externalRef: string; observedAt: string };
}
export interface MailLabel {
  id: string;
  name: string;
  type: string;
}

export function useThreads(params: Params, enabled = true) {
  return useQuery({
    queryKey: [KEY, "threads", params],
    queryFn: () =>
      fetchJson<{
        data: { data: ThreadSummary[]; nextPageToken: string | null; fetchedAt: string };
      }>(withQuery("/api/v1/email/threads", params)).then((r) => r.data),
    enabled,
    retry: false,
  });
}
export function useThread(id: string | null) {
  return useQuery({
    queryKey: [KEY, "thread", id],
    enabled: Boolean(id),
    queryFn: () =>
      fetchJson<{ data: { id: string; messages: MailMessage[]; fetchedAt: string } }>(
        `/api/v1/email/threads/${id}`,
      ).then((r) => r.data),
    retry: false,
  });
}
export function useLabels() {
  return useQuery({
    queryKey: [KEY, "labels"],
    queryFn: () => fetchJson<{ data: MailLabel[] }>("/api/v1/email/labels").then((r) => r.data),
    retry: false,
  });
}
export function useModifyMessage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...change }: { id: string } & Record<string, unknown>) =>
      sendJson("POST", `/api/v1/email/messages/${id}/modify`, change),
    onSuccess: invalidate,
  });
}
export function useSendEmail() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      sendJson("POST", "/api/v1/email/send", { ...body, confirm: true }),
    onSuccess: invalidate,
  });
}
export function useSaveDraft() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => sendJson("POST", "/api/v1/email/drafts", body),
  });
}

// ── Drive ────────────────────────────────────────────────────────────────────
export interface DriveFile {
  externalId: string;
  name: string;
  mimeType: string;
  kind: string;
  owner: string | null;
  createdDate: string | null;
  modifiedDate: string | null;
  size: number | null;
  url: string | null;
  parents: string[];
  shared: boolean;
}
export function useDriveFiles(params: Params) {
  return useQuery({
    queryKey: [KEY, "drive", params],
    queryFn: () =>
      fetchJson<{ data: { data: DriveFile[]; nextPageToken: string | null; fetchedAt: string } }>(
        withQuery("/api/v1/drive/files", params),
      ).then((r) => r.data),
    retry: false,
  });
}

// ── Calendar ─────────────────────────────────────────────────────────────────
export interface CalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
  color: string | null;
}
export interface CalendarEvent {
  externalId: string;
  calendarId: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  timeZone: string | null;
  allDay: boolean;
  organizer: string | null;
  attendees: { email: string; status: string }[];
  url: string | null;
  status: string;
}
export function useCalendars() {
  return useQuery({
    queryKey: [KEY, "calendars"],
    queryFn: () =>
      fetchJson<{ data: CalendarInfo[] }>("/api/v1/calendar/calendars").then((r) => r.data),
    retry: false,
  });
}
export function useEvents(params: Params, enabled = true) {
  return useQuery({
    queryKey: [KEY, "events", params],
    queryFn: () =>
      fetchJson<{
        data: { data: CalendarEvent[]; nextPageToken: string | null; fetchedAt: string };
      }>(withQuery("/api/v1/calendar/events", params)).then((r) => r.data),
    enabled,
    retry: false,
  });
}
export function useCreateEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      sendJson("POST", "/api/v1/calendar/events", { ...body, confirm: true }),
    onSuccess: invalidate,
  });
}
export function useCancelEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, calendarId }: { id: string; calendarId: string }) =>
      sendJson("DELETE", `/api/v1/calendar/events/${id}`, { calendarId, confirm: true }),
    onSuccess: invalidate,
  });
}

export type { ApiError };
