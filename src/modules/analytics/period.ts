import { DAY_MS as DAY, utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";

import type { RangePreset } from "./dashboard.schemas";

/**
 * A resolved reporting period. Boundaries are whole calendar days in UTC, inclusive
 * (`start` 00:00 … `end` 23:59:59.999). `all` has no bounds.
 */
export interface Period {
  range: RangePreset;
  /** Inclusive first day, or null for all time. */
  start: Date | null;
  /** Inclusive last day, or null for all time. */
  end: Date | null;
  days: number | null;
  label: string;
}

export interface PeriodDto {
  range: RangePreset;
  from: string | null;
  to: string | null;
  days: number | null;
  label: string;
}

const PRESET_DAYS: Record<"30d" | "90d" | "365d", number> = { "30d": 30, "90d": 90, "365d": 365 };

export function resolvePeriod(
  input: { range: RangePreset; from?: Date; to?: Date },
  now: Date = new Date(),
): Period {
  if (input.range === "all")
    return { range: "all", start: null, end: null, days: null, label: "All time" };
  if (input.range === "custom" && input.from && input.to) {
    const start = utcDay(input.from);
    const end = utcDay(input.to);
    const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
    return {
      range: "custom",
      start,
      end,
      days,
      label: `${toDateOnly(start)} – ${toDateOnly(end)}`,
    };
  }
  const preset = input.range === "custom" ? "90d" : input.range;
  const days = PRESET_DAYS[preset];
  const end = utcDay(now);
  const start = new Date(end.getTime() - (days - 1) * DAY);
  return { range: preset, start, end, days, label: `Last ${days} days` };
}

/** The equal-length period immediately before `period`, or null when unbounded. */
export function previousPeriod(period: Period): Period | null {
  if (!period.start || !period.end || !period.days) return null;
  const end = new Date(period.start.getTime() - DAY);
  const start = new Date(end.getTime() - (period.days - 1) * DAY);
  return {
    range: "custom",
    start,
    end,
    days: period.days,
    label: `${toDateOnly(start)} – ${toDateOnly(end)}`,
  };
}

/** Prisma filter for a `@db.Date` column. */
export function dateWhere(period: Period): { gte?: Date; lte?: Date } | undefined {
  if (!period.start || !period.end) return undefined;
  return { gte: period.start, lte: period.end };
}

/** Prisma filter for a timestamp column (end day inclusive). */
export function timestampWhere(period: Period): { gte?: Date; lt?: Date } | undefined {
  if (!period.start || !period.end) return undefined;
  return { gte: period.start, lt: new Date(period.end.getTime() + DAY) };
}

export function toPeriodDto(period: Period): PeriodDto {
  return {
    range: period.range,
    from: toDateOnly(period.start),
    to: toDateOnly(period.end),
    days: period.days,
    label: period.label,
  };
}
