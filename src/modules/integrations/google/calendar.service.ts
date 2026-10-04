import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/modules/shared/service-context";

import type { IntegrationDeps } from "../integration.service";
import { provenanceOf } from "../provenance";

import { createGoogleClient } from "./google.client";

/**
 * Google Calendar service. Reads calendars/events and performs ONLY explicit mutations (create,
 * update, cancel) — never from an AI suggestion or as a side effect. Google remains the source of
 * truth.
 */
const BASE = "https://www.googleapis.com/calendar/v3";
const PROVIDER = "google" as const;

interface RawDate {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
interface RawEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: RawDate;
  end?: RawDate;
  organizer?: { email?: string; displayName?: string };
  attendees?: { email?: string; responseStatus?: string }[];
  recurrence?: string[];
  htmlLink?: string;
  status?: string;
}

export function normalizeEvent(calendarId: string, raw: RawEvent, now: Date) {
  const allDay = Boolean(raw.start?.date && !raw.start?.dateTime);
  return {
    externalId: raw.id,
    calendarId,
    summary: raw.summary ?? "(no title)",
    description: raw.description ?? null,
    location: raw.location ?? null,
    start: raw.start?.dateTime ?? raw.start?.date ?? null,
    end: raw.end?.dateTime ?? raw.end?.date ?? null,
    timeZone: raw.start?.timeZone ?? null,
    allDay,
    organizer: raw.organizer?.displayName ?? raw.organizer?.email ?? null,
    attendees: (raw.attendees ?? []).map((a) => ({
      email: a.email ?? "",
      status: a.responseStatus ?? "needsAction",
    })),
    recurrence: raw.recurrence ?? [],
    url: raw.htmlLink ?? null,
    status: raw.status ?? "confirmed",
    provenance: provenanceOf({
      provider: PROVIDER,
      resourceType: "calendar_event",
      externalId: raw.id,
      sourceUrl: raw.htmlLink ?? null,
      observedAt: now,
      lastSyncedAt: now,
    }),
  };
}

const qs = (params: Record<string, string | number | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

export interface EventInput {
  summary: string;
  description?: string;
  start: string;
  end: string;
  timeZone?: string;
  location?: string;
  attendees?: string[];
}

function toApiEvent(input: EventInput, allDay = false) {
  const dateField = (v: string): RawDate =>
    allDay ? { date: v.slice(0, 10) } : { dateTime: v, timeZone: input.timeZone };
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: dateField(input.start),
    end: dateField(input.end),
    attendees: input.attendees?.map((email) => ({ email })),
  };
}

export function createCalendarService(db: PrismaClient, deps: IntegrationDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const audit = (ctx: ServiceContext, verb: string, entityId: string | null) =>
    db.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: `calendar.${verb}`,
        entityType: "calendar",
        entityId,
        requestId: ctx.requestId,
      },
    });

  return {
    async listCalendars(ctx: ServiceContext) {
      const res = await createGoogleClient(db, ctx, deps).get<{
        items?: { id: string; summary?: string; primary?: boolean; backgroundColor?: string }[];
      }>(`${BASE}/users/me/calendarList`);
      return (res.items ?? []).map((c) => ({
        id: c.id,
        summary: c.summary ?? c.id,
        primary: Boolean(c.primary),
        color: c.backgroundColor ?? null,
      }));
    },

    async listEvents(
      ctx: ServiceContext,
      query: {
        calendarId?: string;
        timeMin: string;
        timeMax: string;
        pageToken?: string;
        maxResults?: number;
      },
    ) {
      const google = createGoogleClient(db, ctx, deps);
      const cal = query.calendarId ?? "primary";
      const max = Math.min(Math.max(query.maxResults ?? 100, 1), 250);
      const res = await google.get<{ items?: RawEvent[]; nextPageToken?: string }>(
        `${BASE}/calendars/${encodeURIComponent(cal)}/events${qs({
          timeMin: query.timeMin,
          timeMax: query.timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: max,
          pageToken: query.pageToken,
        })}`,
      );
      const at = now();
      await google.touchSync();
      return {
        data: (res.items ?? []).map((e) => normalizeEvent(cal, e, at)),
        nextPageToken: res.nextPageToken ?? null,
        fetchedAt: at.toISOString(),
      };
    },

    async getEvent(ctx: ServiceContext, calendarId: string, eventId: string) {
      const raw = await createGoogleClient(db, ctx, deps).get<RawEvent>(
        `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      );
      return normalizeEvent(calendarId, raw, now());
    },

    /** Create an event — only from an explicit, confirmed user action. */
    async createEvent(ctx: ServiceContext, calendarId: string, input: EventInput) {
      const raw = await createGoogleClient(db, ctx, deps).post<RawEvent>(
        `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
        toApiEvent(input),
      );
      await audit(ctx, "event_created", raw.id);
      return normalizeEvent(calendarId, raw, now());
    },

    async updateEvent(ctx: ServiceContext, calendarId: string, eventId: string, input: EventInput) {
      const raw = await createGoogleClient(db, ctx, deps).patch<RawEvent>(
        `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        toApiEvent(input),
      );
      await audit(ctx, "event_updated", eventId);
      return normalizeEvent(calendarId, raw, now());
    },

    async cancelEvent(ctx: ServiceContext, calendarId: string, eventId: string) {
      await createGoogleClient(db, ctx, deps).del(
        `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      );
      await audit(ctx, "event_cancelled", eventId);
    },
  };
}
