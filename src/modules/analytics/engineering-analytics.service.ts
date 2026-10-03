import type { z } from "zod";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";

import { METRIC_CATALOGUE } from "./metric-catalogue";
import { comparisonFor, metricResult } from "./metric-result";
import { previousPeriod, resolvePeriod, toPeriodDto, type Period } from "./period";
import { monthlyCounts, portfolioFiltersSchema } from "./portfolio.service";

/**
 * Engineering Analytics (Phase 9, ADR 0051). A cross-domain view of recorded engineering activity
 * over time, built only from authoritative dated records — no fabrication, no inferred history, no
 * time tracking, no opaque score. Integration/DORA metrics have no data source in PEOS and are
 * surfaced as explicitly unavailable (05: "do not fabricate metrics when integrations are
 * unavailable"). Every number reuses the same dates the domain services use, so it reconciles with
 * them (integration-tested). Two owner-scoped SQL aggregates compute the whole surface (no N+1).
 */

/** The authoritative dated engineering events, one per domain (no double counting). */
const DOMAINS = [
  { key: "projects", label: "Projects completed", table: "projects", col: "completed_at" },
  { key: "milestones", label: "Milestones completed", table: "milestones", col: "completed_at" },
  { key: "evidence", label: "Evidence recorded", table: "evidence", col: "date" },
  { key: "goals", label: "Goals completed", table: "goals", col: "completed_at" },
  {
    key: "architecture",
    label: "Architecture decisions",
    table: "architecture_decisions",
    col: "decided_at",
  },
  { key: "experiments", label: "Experiment runs", table: "experiment_runs", col: "run_at" },
  {
    key: "certifications",
    label: "Certifications earned",
    table: "certifications",
    col: "issue_date",
  },
] as const;

export type ActivityDomain = (typeof DOMAINS)[number]["key"];

interface DomainCount {
  domain: ActivityDomain;
  in_period: number;
  prev: number;
  before: number;
  all_dated: number;
  base: number;
}

export const engineeringFiltersSchema = portfolioFiltersSchema;
export type EngineeringFilters = z.infer<typeof engineeringFiltersSchema>;

const NO_DATA = "No engineering records yet.";
const INSUFFICIENT =
  "You have engineering records, but none carry the dates engineering activity is measured from.";

/** One UNION arm of the counts matrix for a domain. Column names come from a fixed allow-list. */
function countsArm(
  domain: (typeof DOMAINS)[number],
  userId: string,
  period: Period,
  prev: Period | null,
) {
  const col = Prisma.raw(`"${domain.col}"`);
  const bounded = Boolean(period.start && period.end);
  const inExpr = bounded
    ? Prisma.sql`(COUNT(*) FILTER (WHERE ${col} >= ${period.start}::date AND ${col} <= ${period.end}::date))::int`
    : Prisma.sql`(COUNT(*) FILTER (WHERE ${col} IS NOT NULL))::int`;
  const prevExpr =
    bounded && prev
      ? Prisma.sql`(COUNT(*) FILTER (WHERE ${col} >= ${prev.start}::date AND ${col} <= ${prev.end}::date))::int`
      : Prisma.sql`(COUNT(*) FILTER (WHERE false))::int`;
  const beforeExpr = bounded
    ? Prisma.sql`(COUNT(*) FILTER (WHERE ${col} < ${period.start}::date))::int`
    : Prisma.sql`(COUNT(*) FILTER (WHERE false))::int`;
  return Prisma.sql`
    SELECT ${domain.key} AS domain,
      ${inExpr} AS in_period,
      ${prevExpr} AS prev,
      ${beforeExpr} AS before,
      (COUNT(*) FILTER (WHERE ${col} IS NOT NULL))::int AS all_dated,
      COUNT(*)::int AS base
    FROM ${Prisma.raw(domain.table)}
    WHERE user_id = ${userId}::uuid`;
}

/** One UNION arm of the monthly totals for a domain, within the window. */
function monthlyArm(domain: (typeof DOMAINS)[number], userId: string, period: Period) {
  const col = Prisma.raw(`"${domain.col}"`);
  const window =
    period.start && period.end
      ? Prisma.sql`AND ${col} >= ${period.start}::date AND ${col} <= ${period.end}::date`
      : Prisma.empty;
  return Prisma.sql`
    SELECT to_char(date_trunc('month', ${col}), 'YYYY-MM') AS month, COUNT(*)::int AS count
    FROM ${Prisma.raw(domain.table)}
    WHERE user_id = ${userId}::uuid AND ${col} IS NOT NULL ${window}
    GROUP BY 1`;
}

export function createEngineeringAnalyticsService(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return {
    async engineering(ctx: ServiceContext, filters: EngineeringFilters) {
      const now = clock();
      const userId = ctx.userId;
      const period = resolvePeriod(filters, now);
      const periodDto = toPeriodDto(period);
      const prev = previousPeriod(period);

      const [counts, monthlyRows] = await Promise.all([
        db.$queryRaw<DomainCount[]>`${Prisma.join(
          DOMAINS.map((d) => countsArm(d, userId, period, prev)),
          " UNION ALL ",
        )}`,
        db.$queryRaw<{ month: string; count: number }[]>`
          SELECT month, SUM(count)::int AS count FROM (
            ${Prisma.join(
              DOMAINS.map((d) => monthlyArm(d, userId, period)),
              " UNION ALL ",
            )}
          ) t GROUP BY month ORDER BY month`,
      ]);

      const byKey = new Map(counts.map((c) => [c.domain, c]));
      const sum = (f: (c: DomainCount) => number) => counts.reduce((s, c) => s + f(c), 0);
      const total = sum((c) => c.in_period);
      const prevTotal = sum((c) => c.prev);
      const beforeTotal = sum((c) => c.before);
      const allDatedTotal = sum((c) => c.all_dated);
      const baseTotal = sum((c) => c.base);

      const hasBase = baseTotal > 0;
      // Records exist but none are dated → genuinely insufficient, not a real zero.
      const insufficientReason = hasBase && allDatedTotal === 0 ? INSUFFICIENT : null;
      const base = {
        value: total,
        hasBaseRecords: hasBase,
        insufficientReason,
        noDataReason: NO_DATA,
      };

      const trend = monthlyCounts(monthlyRows, period);

      const activity = metricResult("engineering.activity", {
        ...base,
        period: periodDto,
        comparison: comparisonFor({
          previous: prev ? { value: prevTotal, period: toPeriodDto(prev) } : null,
          hasHistoryBeforePeriod: beforeTotal > 0,
          entityLabel: "engineering event",
        }),
      });

      const byDomain = metricResult("engineering.activity_by_domain", {
        ...base,
        period: periodDto,
        breakdown: DOMAINS.map((d) => ({
          key: d.key,
          label: d.label,
          value: byKey.get(d.key)?.in_period ?? 0,
        })),
      });

      const activityTrend = {
        ...metricResult("engineering.activity_trend", {
          ...base,
          value: trend.points.reduce((s, p) => s + p.value, 0),
          period: periodDto,
          breakdown: trend.points,
        }),
        truncated: trend.truncated,
      };

      const integrations = METRIC_CATALOGUE.filter(
        (m) => m.category === "engineering" && m.availability.status === "unavailable",
      ).map((m) => ({
        key: m.key,
        name: m.name,
        definition: m.definition,
        source: m.source,
        specRef: m.specRef,
        reason: m.availability.status === "unavailable" ? m.availability.reason : "",
        plannedPhase: m.availability.status === "unavailable" ? m.availability.plannedPhase : "",
      }));

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(utcDay(now)),
        period: periodDto,
        recordCounts: Object.fromEntries(
          DOMAINS.map((d) => [d.key, byKey.get(d.key)?.base ?? 0]),
        ) as Record<ActivityDomain, number>,
        activity,
        byDomain,
        trend: activityTrend,
        integrations,
      };
    },
  };
}

export type EngineeringAnalyticsDto = Awaited<
  ReturnType<ReturnType<typeof createEngineeringAnalyticsService>["engineering"]>
>;
