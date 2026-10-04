import { z } from "zod";

import { booleanQuerySchema, searchTermSchema } from "@/lib/http/pagination";
import { isoDate } from "@/modules/shared/fields";

/** Request contracts for the integration API (Phase 9.5). Closed enums; no owner identity accepted. */

export const integrationProviderSchema = z.enum(["github", "google"]);

export const oauthCallbackSchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(4096).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(500).optional(),
});

const page = z.coerce.number().int().min(1).max(1000).default(1);
const perPage = z.coerce.number().int().min(1).max(50).default(30);

export const listReposQuerySchema = z.object({
  page,
  perPage,
  q: searchTermSchema,
  sort: z.enum(["updated", "pushed", "full_name", "created"]).default("updated"),
  visibility: z.enum(["all", "public", "private"]).default("all"),
  archived: booleanQuerySchema,
  fork: booleanQuerySchema,
});
export type ListReposQuery = z.infer<typeof listReposQuerySchema>;

export const listCommitsQuerySchema = z
  .object({
    page,
    perPage,
    sha: z.string().trim().min(1).max(100).optional(),
    since: isoDate.optional(),
    until: isoDate.optional(),
  })
  .transform((v) => ({
    ...v,
    since: v.since?.toISOString(),
    until: v.until?.toISOString(),
  }));

export const listActivityQuerySchema = z.object({ page, perPage });

export const linkProjectSchema = z.object({ projectId: z.uuid() });
export type LinkProjectInput = z.infer<typeof linkProjectSchema>;

// ── Google: Gmail ─────────────────────────────────────────────────────────────
const isoDateTime = z
  .string()
  .min(10)
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date-time");
const gmailId = z.string().trim().min(1).max(128);
const labelId = z.string().trim().min(1).max(128);

export const listThreadsQuerySchema = z.object({
  label: z.string().trim().min(1).max(64).optional(),
  q: z.string().trim().min(1).max(400).optional(),
  pageToken: z.string().trim().min(1).max(4096).optional(),
  maxResults: z.coerce.number().int().min(1).max(25).default(15),
});

export const modifyMessageSchema = z.object({
  star: z.boolean().optional(),
  read: z.boolean().optional(),
  archive: z.boolean().optional(),
  addLabelIds: z.array(labelId).max(20).optional(),
  removeLabelIds: z.array(labelId).max(20).optional(),
});

export const sendEmailSchema = z.object({
  to: z.string().trim().min(3).max(400),
  cc: z.string().trim().max(400).optional(),
  subject: z.string().trim().max(500).default(""),
  body: z.string().max(100_000).default(""),
  inReplyTo: z.string().trim().max(400).optional(),
  references: z.string().trim().max(4000).optional(),
  // Explicit-confirmation guard: a send never happens without it (ADR 0053).
  confirm: z.literal(true),
});

export const draftSchema = z.object({
  to: z.string().trim().max(400).default(""),
  cc: z.string().trim().max(400).optional(),
  subject: z.string().trim().max(500).default(""),
  body: z.string().max(100_000).default(""),
  threadId: gmailId.optional(),
});

// ── Google: Drive ─────────────────────────────────────────────────────────────
export const listFilesQuerySchema = z.object({
  folderId: z.string().trim().min(1).max(128).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  shared: booleanQuerySchema,
  recent: booleanQuerySchema,
  pageToken: z.string().trim().min(1).max(4096).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

// ── Google: Calendar ──────────────────────────────────────────────────────────
export const listEventsQuerySchema = z.object({
  calendarId: z.string().trim().min(1).max(256).optional(),
  timeMin: isoDateTime,
  timeMax: isoDateTime,
  pageToken: z.string().trim().min(1).max(4096).optional(),
  maxResults: z.coerce.number().int().min(1).max(250).default(100),
});

export const eventBodySchema = z.object({
  calendarId: z.string().trim().min(1).max(256).default("primary"),
  summary: z.string().trim().min(1).max(500),
  description: z.string().max(10_000).optional(),
  start: isoDateTime,
  end: isoDateTime,
  timeZone: z.string().trim().max(64).optional(),
  location: z.string().trim().max(500).optional(),
  attendees: z.array(z.string().trim().email().max(320)).max(50).optional(),
  allDay: z.boolean().optional(),
  confirm: z.literal(true),
});

export const cancelEventSchema = z.object({
  calendarId: z.string().trim().min(1).max(256).default("primary"),
  confirm: z.literal(true),
});

// ── GitHub Repository Intelligence (Phase 9.6) ────────────────────────────────
export const githubRangeQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d", "180d", "365d", "all", "custom"]).default("90d"),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const githubReposQuerySchema = z.object({
  q: searchTermSchema,
  visibility: z.enum(["public", "private"]).optional(),
  type: z.enum(["original", "fork"]).optional(),
  status: z.enum(["active", "archived"]).optional(),
  language: z.string().trim().min(1).max(80).optional(),
  activity: z.enum(["recent", "idle_30", "idle_90", "idle_180"]).optional(),
  sort: z
    .enum(["pushed", "updated", "name", "stars", "forks", "issues", "commits"])
    .default("pushed"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
