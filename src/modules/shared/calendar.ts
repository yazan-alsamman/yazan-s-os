/**
 * Calendar-day semantics shared by analytics and project intelligence (ADR 0019, ADR 0022).
 *
 * PEOS stores plan/completion dates as `@db.Date` (a calendar day without a time zone) and
 * evaluates "today" as the current **UTC** calendar day. Every date comparison goes through these
 * helpers, and every caller takes `now` as a parameter so tests are deterministic.
 */
export const DAY_MS = 86_400_000;

/** The UTC calendar day containing `date`, at 00:00:00.000Z. */
export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** "Today" for overdue/schedule rules: the UTC calendar day of `now`. */
export function utcToday(now: Date = new Date()): Date {
  return utcDay(now);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((utcDay(to).getTime() - utcDay(from).getTime()) / DAY_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(utcDay(date).getTime() + days * DAY_MS);
}
