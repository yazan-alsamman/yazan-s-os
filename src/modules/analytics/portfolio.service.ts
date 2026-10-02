import { z } from "zod";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { ProjectHealth, TechnologyUsageType } from "@/generated/prisma/enums";
import { paginationQuerySchema } from "@/lib/http/pagination";
import { overdueWhere } from "@/modules/milestones/milestone.repository";
import {
  HEALTH_BAND_LABELS,
  type ComputedHealth,
  type HealthBand,
} from "@/modules/projects/project-health";
import {
  computeHealthForProjects,
  deliveryRateResult,
} from "@/modules/projects/project-intelligence";
import { LIFECYCLE_ORDER } from "@/modules/projects/project.lifecycle";
import { projectHealthSchema } from "@/modules/projects/project.schemas";
import { utcDay } from "@/modules/shared/calendar";
import { isoDate, toDateOnly } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";

import { RANGE_PRESETS } from "./dashboard.schemas";
import { MAX_SERIES_MONTHS, monthsBetween } from "./dashboard.service";
import { metricResult, type DistributionBucket } from "./metric-result";
import { dateWhere, resolvePeriod, toPeriodDto, type Period } from "./period";

/**
 * Project portfolio analytics (ADR 0025). Point-in-time distributions describe the current state;
 * trends use recorded completion dates only. Computed health is evaluated for every project with a
 * fixed number of queries (no N+1) — there is no stored health history.
 */
export const TECHNOLOGY_LIMIT = 15;
export const PORTFOLIO_ATTENTION_LIMIT = 10;

const customRange = (value: { range: string; from?: Date; to?: Date }, ctx: z.RefinementCtx) => {
  if (value.range !== "custom") return;
  if (!value.from || !value.to) {
    ctx.addIssue({
      code: "custom",
      path: ["from"],
      message: "A custom range needs both from and to",
    });
  } else if (value.to < value.from) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: "The end date must not be before the start date",
    });
  } else if ((value.to.getTime() - value.from.getTime()) / 86_400_000 + 1 > 366 * 20) {
    ctx.addIssue({
      code: "custom",
      path: ["from"],
      message: "A custom range may span at most 20 years",
    });
  }
};

export const portfolioFiltersSchema = z
  .object({
    range: z.enum(RANGE_PRESETS).default("365d"),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .superRefine(customRange);

export const COMPUTED_BUCKETS = [
  "good",
  "watch",
  "poor",
  "insufficient_data",
  "not_applicable",
] as const;
export type ComputedBucket = (typeof COMPUTED_BUCKETS)[number];
export const COMPUTED_BUCKET_LABELS: Record<ComputedBucket, string> = {
  ...HEALTH_BAND_LABELS,
  insufficient_data: "Insufficient data",
  not_applicable: "Archived (not assessed)",
};

export function bucketOf(health: ComputedHealth): ComputedBucket {
  if (health.status === "not_applicable") return "not_applicable";
  if (health.band === null) return "insufficient_data";
  return health.band as HealthBand;
}

export const healthListQuerySchema = paginationQuerySchema.extend({
  computed: z.enum(COMPUTED_BUCKETS).optional(),
  manual: projectHealthSchema.optional(),
});

const HEALTH_LABELS: Record<ProjectHealth, string> = {
  not_assessed: "Not assessed",
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
};
const MANUAL_ORDER: ProjectHealth[] = ["on_track", "at_risk", "blocked", "not_assessed"];
const STATUS_LABEL = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Continuous monthly series from sparse GROUP BY rows (zero months are real zeros). */
export function monthlyCounts(
  rows: { month: string; count: number }[],
  period: Period,
): { points: DistributionBucket[]; truncated: boolean } {
  if (!period.start && rows.length === 0) return { points: [], truncated: false };
  const months =
    period.start && period.end
      ? monthsBetween(period.start, period.end)
      : monthsBetween(
          new Date(`${rows[0]!.month}-01T00:00:00Z`),
          new Date(`${rows.at(-1)!.month}-01T00:00:00Z`),
        );
  const truncated = months.length > MAX_SERIES_MONTHS;
  const kept = truncated ? months.slice(-MAX_SERIES_MONTHS) : months;
  const counts = new Map(rows.map((r) => [r.month, r.count]));
  return {
    points: kept.map((m) => ({ key: m, label: m, value: counts.get(m) ?? 0 })),
    truncated,
  };
}

async function monthly(
  db: PrismaClient,
  table: "projects" | "milestones",
  userId: string,
  period: Period,
) {
  const range =
    period.start && period.end
      ? Prisma.sql`AND completed_at >= ${period.start}::date AND completed_at <= ${period.end}::date`
      : Prisma.empty;
  const rows = await db.$queryRaw<{ month: string; count: number }[]>`
    SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
    FROM ${Prisma.raw(table === "projects" ? "projects" : "milestones")}
    WHERE user_id = ${userId}::uuid AND completed_at IS NOT NULL ${range}
    GROUP BY 1 ORDER BY 1`;
  return monthlyCounts(rows, period);
}

export function createPortfolioService(db: PrismaClient, clock: () => Date = () => new Date()) {
  async function allHealth(userId: string, now: Date) {
    const projects = await db.project.findMany({
      where: { userId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        healthStatus: true,
        targetDate: true,
        completedAt: true,
      },
    });
    return computeHealthForProjects(db, userId, projects, now);
  }

  return {
    async portfolio(ctx: ServiceContext, filters: z.infer<typeof portfolioFiltersSchema>) {
      const now = clock();
      const userId = ctx.userId;
      const period = resolvePeriod(filters, now);
      const periodDto = toPeriodDto(period);
      const range = dateWhere(period);

      const [
        health,
        lifecycle,
        manual,
        milestoneTotal,
        milestoneCompleted,
        milestonesCompletedInPeriod,
        overdue,
        blocked,
        projectTrend,
        milestoneTrend,
        techRows,
        withEvidence,
        overdueItems,
      ] = await Promise.all([
        allHealth(userId, now),
        db.project.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
        db.project.groupBy({ by: ["healthStatus"], where: { userId }, _count: { _all: true } }),
        db.milestone.count({ where: { userId } }),
        db.milestone.count({ where: { userId, status: "completed" } }),
        db.milestone.count({ where: { userId, completedAt: range ?? { not: null } } }),
        db.milestone.count({ where: { AND: [{ userId }, overdueWhere(now)] } }),
        db.milestone.count({ where: { userId, status: "blocked" } }),
        monthly(db, "projects", userId, period),
        monthly(db, "milestones", userId, period),
        db.technologyUsage.groupBy({
          by: ["technologyId", "usageType"],
          where: { userId },
          _count: { _all: true },
        }),
        db.project.count({ where: { userId, evidence: { some: {} } } }),
        db.milestone.findMany({
          where: { AND: [{ userId }, overdueWhere(now)] },
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
          take: PORTFOLIO_ATTENTION_LIMIT,
          select: {
            id: true,
            title: true,
            dueDate: true,
            project: { select: { id: true, name: true } },
          },
        }),
      ]);

      const projectCount = health.length;
      const hasProjects = projectCount > 0;
      const noProjects = "No projects yet.";
      const hasMilestones = milestoneTotal > 0;
      const noMilestones = "No milestones are recorded yet.";

      // Lifecycle and manual health: every bucket, zeros included, in canonical order.
      const statusCounts = new Map(lifecycle.map((r) => [r.status, r._count._all]));
      const manualCounts = new Map(manual.map((r) => [r.healthStatus, r._count._all]));

      // Computed health distribution and manual × computed matrix.
      const computedCounts = new Map<ComputedBucket, number>(COMPUTED_BUCKETS.map((b) => [b, 0]));
      const matrix = new Map<string, number>();
      for (const { project, health: h } of health) {
        const bucket = bucketOf(h);
        computedCounts.set(bucket, computedCounts.get(bucket)! + 1);
        const key = `${project.healthStatus}|${bucket}`;
        matrix.set(key, (matrix.get(key) ?? 0) + 1);
      }

      // Technology usage: projects per technology (one usage row per project–technology pair).
      const perTech = new Map<
        string,
        { total: number; byUsage: Partial<Record<TechnologyUsageType, number>> }
      >();
      for (const row of techRows) {
        const entry = perTech.get(row.technologyId) ?? { total: 0, byUsage: {} };
        entry.total += row._count._all;
        entry.byUsage[row.usageType] = (entry.byUsage[row.usageType] ?? 0) + row._count._all;
        perTech.set(row.technologyId, entry);
      }
      const ranked = [...perTech.entries()].sort((a, b) => b[1].total - a[1].total);
      const top = ranked.slice(0, TECHNOLOGY_LIMIT);
      const names = top.length
        ? await db.technology.findMany({
            where: { userId, id: { in: top.map(([id]) => id) } },
            select: { id: true, name: true },
          })
        : [];
      const nameOf = new Map(names.map((t) => [t.id, t.name]));
      const technologies = top
        .map(([id, v]) => ({ id, name: nameOf.get(id) ?? "", total: v.total, byUsage: v.byUsage }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      const otherTechnologies = ranked.slice(TECHNOLOGY_LIMIT);

      const attentionHealth = health
        .filter((h) => h.health.band === "poor")
        .sort(
          (a, b) =>
            a.health.score! - b.health.score! || a.project.name.localeCompare(b.project.name),
        )
        .slice(0, PORTFOLIO_ATTENTION_LIMIT)
        .map((h) => ({ id: h.project.id, name: h.project.name, score: h.health.score }));

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(utcDay(now)),
        period: periodDto,
        recordCounts: { projects: projectCount, milestones: milestoneTotal },
        lifecycle: metricResult("projects.lifecycle_distribution", {
          value: projectCount,
          hasBaseRecords: hasProjects,
          noDataReason: noProjects,
          breakdown: LIFECYCLE_ORDER.map((s) => ({
            key: s,
            label: STATUS_LABEL(s),
            value: statusCounts.get(s) ?? 0,
          })),
        }),
        manualHealth: metricResult("projects.health_distribution", {
          value: projectCount,
          hasBaseRecords: hasProjects,
          noDataReason: noProjects,
          breakdown: MANUAL_ORDER.map((h) => ({
            key: h,
            label: HEALTH_LABELS[h],
            value: manualCounts.get(h) ?? 0,
          })),
        }),
        computedHealth: metricResult("projects.computed_health_distribution", {
          value: projectCount,
          hasBaseRecords: hasProjects,
          noDataReason: noProjects,
          breakdown: COMPUTED_BUCKETS.map((b) => ({
            key: b,
            label: COMPUTED_BUCKET_LABELS[b],
            value: computedCounts.get(b)!,
          })),
        }),
        healthComparison: metricResult("projects.health_comparison", {
          value: projectCount,
          hasBaseRecords: hasProjects,
          noDataReason: noProjects,
          breakdown: MANUAL_ORDER.flatMap((m) =>
            COMPUTED_BUCKETS.map((c) => ({
              key: `${m}|${c}`,
              label: `${HEALTH_LABELS[m]} / ${COMPUTED_BUCKET_LABELS[c]}`,
              value: matrix.get(`${m}|${c}`) ?? 0,
            })),
          ),
        }),
        deliveryTrend: {
          ...metricResult("projects.delivery_trend", {
            value: projectTrend.points.reduce((s, p) => s + p.value, 0),
            hasBaseRecords: hasProjects,
            noDataReason: noProjects,
            period: periodDto,
            breakdown: projectTrend.points,
          }),
          truncated: projectTrend.truncated,
        },
        milestones: {
          total: metricResult("projects.milestones_total", {
            value: milestoneTotal,
            hasBaseRecords: hasMilestones,
            noDataReason: noMilestones,
          }),
          completedInPeriod: metricResult("projects.milestones_completed_in_period", {
            value: milestonesCompletedInPeriod,
            hasBaseRecords: hasMilestones,
            noDataReason: noMilestones,
            period: periodDto,
            comparison: null,
          }),
          overdue: metricResult("projects.milestones_overdue", {
            value: overdue,
            hasBaseRecords: hasMilestones,
            noDataReason: noMilestones,
          }),
          blocked: metricResult("projects.milestones_blocked", {
            value: blocked,
            hasBaseRecords: hasMilestones,
            noDataReason: noMilestones,
          }),
          deliveryRate: deliveryRateResult(
            { completed: milestoneCompleted, overdue },
            hasMilestones,
            noMilestones,
          ),
          trend: {
            ...metricResult("projects.milestone_completion_trend", {
              value: milestoneTrend.points.reduce((s, p) => s + p.value, 0),
              hasBaseRecords: hasMilestones,
              noDataReason: noMilestones,
              period: periodDto,
              breakdown: milestoneTrend.points,
            }),
            truncated: milestoneTrend.truncated,
          },
        },
        technologies: {
          ...metricResult("projects.technology_usage", {
            value: perTech.size,
            hasBaseRecords: perTech.size > 0,
            noDataReason: "No project has a technology linked yet.",
            breakdown: technologies.map((t) => ({ key: t.id, label: t.name, value: t.total })),
          }),
          rows: technologies,
          other: {
            technologies: otherTechnologies.length,
            usages: otherTechnologies.reduce((s, [, v]) => s + v.total, 0),
          },
        },
        evidenceCoverage: metricResult("projects.evidence_coverage", {
          value: withEvidence,
          hasBaseRecords: hasProjects,
          noDataReason: noProjects,
          breakdown: [
            { key: "true", label: "With evidence", value: withEvidence },
            { key: "false", label: "Without evidence", value: projectCount - withEvidence },
          ],
        }),
        attention: {
          overdueMilestones: overdueItems.map((m) => ({ ...m, dueDate: toDateOnly(m.dueDate) })),
          poorHealth: attentionHealth,
        },
      };
    },

    /** Computed health per project — the source list for the computed-health distribution. */
    async healthList(ctx: ServiceContext, query: z.infer<typeof healthListQuerySchema>) {
      const now = clock();
      const all = await allHealth(ctx.userId, now);
      const rows = all
        .filter(
          (h) =>
            (!query.computed || bucketOf(h.health) === query.computed) &&
            (!query.manual || h.project.healthStatus === query.manual),
        )
        // Worst first; projects without a score after scored ones; then by name.
        .sort(
          (a, b) =>
            (a.health.score ?? 101) - (b.health.score ?? 101) ||
            a.project.name.localeCompare(b.project.name) ||
            a.project.id.localeCompare(b.project.id),
        );
      const start = (query.page - 1) * query.pageSize;
      return {
        data: rows.slice(start, start + query.pageSize).map(({ project, health, milestones }) => ({
          id: project.id,
          name: project.name,
          status: project.status,
          manual: project.healthStatus,
          computed: {
            status: health.status,
            score: health.score,
            band: health.band,
            bucket: bucketOf(health),
            scoredComponents: health.scoredComponents,
          },
          milestones: { overdue: milestones.overdue, blocked: milestones.blocked },
        })),
        page: {
          page: query.page,
          pageSize: query.pageSize,
          total: rows.length,
          totalPages: Math.max(1, Math.ceil(rows.length / query.pageSize)),
        },
        evaluatedOn: toDateOnly(utcDay(now)),
      };
    },
  };
}

export type PortfolioDto = Awaited<
  ReturnType<ReturnType<typeof createPortfolioService>["portfolio"]>
>;
