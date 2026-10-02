import { z } from "zod";

/**
 * Field-level validators shared by Phase 1 domain schemas (server-authoritative; the UI reuses
 * them for client-side feedback). Limits are deliberately generous but bounded.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** undefined = not provided (PATCH keeps the current value); ""/null = clear the field. */
function emptyToNull(value: string | null | undefined): string | null | undefined {
  return value === undefined ? undefined : value ? value : null;
}

function noControlChars(value: string) {
  return !CONTROL_CHARS.test(value);
}

/** Required single-line text. */
export function requiredText(max: number) {
  return z
    .string()
    .trim()
    .min(1, "Required")
    .max(max, `At most ${max} characters`)
    .refine(noControlChars, "Contains invalid characters");
}

/** Optional text; empty strings become null so "clear this field" is expressible. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .refine(noControlChars, "Contains invalid characters")
    .nullish()
    .transform(emptyToNull);
}

/** Optional long text (multi-line allowed). */
export function optionalLongText(max = 10_000) {
  return z.string().trim().max(max, `At most ${max} characters`).nullish().transform(emptyToNull);
}

/**
 * Optional absolute http(s) URL. Other schemes (javascript:, data:, file:, ...) are rejected so
 * stored URLs are always safe to render as links. PEOS never fetches these URLs server-side.
 */
export const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048, "URL is too long")
  .nullish()
  .transform(emptyToNull)
  .refine((value) => value == null || isHttpUrl(value), "Enter a full http(s):// URL");

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date "YYYY-MM-DD" → Date at UTC midnight. */
export const isoDate = z
  .string()
  .regex(ISO_DATE, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Not a real calendar date")
  .refine((value) => value >= "1900-01-01" && value <= "2200-12-31", "Date is out of range")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const optionalIsoDate = z
  .union([isoDate, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value instanceof Date ? value : value === undefined ? undefined : null));

/** Bullet list, one entry per array item (no default: omitted means unchanged on PATCH). */
export const achievementsSchema = z.array(requiredText(1_000)).max(50, "At most 50 entries");

export const uuidSchema = z.uuid("Invalid identifier");

/** A set of related record ids for replace-set relationship updates. */
export const idSetSchema = z
  .array(uuidSchema)
  .max(500, "Too many related records")
  .transform((ids) => [...new Set(ids)]);

/** Lower-cased, whitespace-collapsed name used for uniqueness and duplicate detection. */
export function normalizeKey(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** URL-safe slug from free text (ASCII only; falls back to "project"). */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
  return slug || "project";
}

/** Date → "YYYY-MM-DD" (or null). */
export function toDateOnly(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** Ensure an optional end date is not before a start date. */
export function datesOrdered(start: Date | null | undefined, end: Date | null | undefined) {
  return !start || !end || end.getTime() >= start.getTime();
}
