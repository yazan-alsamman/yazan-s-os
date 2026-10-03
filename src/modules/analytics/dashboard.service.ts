import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { ProjectHealth, ProjectStatus } from "@/generated/prisma/enums";
import { expiryWhere } from "@/modules/certifications/certification.repository";
import { overdueWhere } from "@/modules/milestones/milestone.repository";
import { ACTIVE_STATUSES, PRODUCTION_STATUSES } from "@/modules/projects/project.lifecycle";
import { projectStatusSchema } from "@/modules/projects/project.schemas";
import { toDateOnly } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";

import type { DashboardFilters } from "./dashboard.schemas";
import {
  comparisonFor,
  metricResult,
  type DistributionBucket,
  type MetricResult,
} from "./metric-result";
import { dateWhere, previousPeriod, resolvePeriod, toPeriodDto, type Period } from "./period";
import { createSkillsAnalyticsService } from "./skills-analytics.service";

/**
 * Command Center calculations (ADR 0019/0020). Every number comes from an owner-scoped database
 * aggregate (COUNT / GROUP BY) — nothing is computed from sample data, nothing is loaded into
 * JavaScript just to be counted. Each metric key maps to a catalogue definition.
 */
const HEALTH_LABELS: Record<ProjectHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
  not_assessed: "Not assessed",
};
const HEALTH_ORDER: ProjectHealth[] = ["on_track", "at_risk", "blocked", "not_assessed"];
const EXPIRY_ORDER = ["valid", "expiring", "expired", "no_expiry"] as const;
const EXPIRY_LABELS = {
  valid: "Valid",
  expiring: "Expiring (90 days)",
  expired: "Expired",
  no_expiry: "No expiry date",
};
export const MAX_CATEGORY_BUCKETS = 12;
export const MAX_SERIES_MONTHS = 120;
export const ATTENTION_LIMIT = 10;
export const TOP_SKILLS_LIMIT = 10;

const humanize = (value: string) => value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function projectWhere(userId: string, f: DashboardFilters): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = { userId };
  if (f.projectStatus) where.status = f.projectStatus;
  if (f.projectHealth) where.healthStatus = f.projectHealth;
  return where;
}

/** Narrow a project filter to a lifecycle group, intersecting with any status filter. */
function withStatuses(
  base: Prisma.ProjectWhereInput,
  statuses: readonly ProjectStatus[],
): Prisma.ProjectWhereInput {
  return { AND: [base, { status: { in: [...statuses] } }] };
}

function evidenceWhere(userId: string, f: DashboardFilters): Prisma.EvidenceWhereInput {
  const where: Prisma.EvidenceWhereInput = { userId };
  if (f.evidenceType) where.type = f.evidenceType;
  if (f.evidenceVerified !== undefined) where.verified = f.evidenceVerified;
  if (f.evidenceOrigin) where.origin = f.evidenceOrigin;
  return where;
}

function skillWhere(userId: string, f: DashboardFilters): Prisma.SkillWhereInput {
  const where: Prisma.SkillWhereInput = { userId };
  if (f.skillCategory) where.category = { equals: f.skillCategory, mode: "insensitive" };
  return where;
}

/** Human-readable labels of the active filters, per dashboard section. */
export function appliedFilterLabels(f: DashboardFilters) {
  const projects: string[] = [];
  if (f.projectStatus) projects.push(`Status: ${humanize(f.projectStatus)}`);
  if (f.projectHealth) projects.push(`Health: ${HEALTH_LABELS[f.projectHealth]}`);
  const evidence: string[] = [];
  if (f.evidenceType) evidence.push(`Type: ${humanize(f.evidenceType)}`);
  if (f.evidenceVerified !== undefined)
    evidence.push(f.evidenceVerified ? "Verified only" : "Unverified only");
  if (f.evidenceOrigin)
    evidence.push(f.evidenceOrigin === "import" ? "Imported only" : "Manual only");
  const skills: string[] = [];
  if (f.skillCategory) skills.push(`Category: ${f.skillCategory}`);
  return { projects, evidence, skills };
}

export interface MonthlyPoint {
  month: string;
  verified: number;
  unverified: number;
}

/** Month buckets (YYYY-MM) between two dates inclusive. */
export function monthsBetween(start: Date, end: Date): string[] {
  const months: string[] = [];
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  const endKey = end.getUTCFullYear() * 12 + end.getUTCMonth();
  while (year * 12 + month <= endKey) {
    months.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return months;
}

/**
 * Fill a sparse monthly aggregate into a continuous series (zeros are real zeros: months inside
 * the range with no dated evidence). Bounded to the latest MAX_SERIES_MONTHS months.
 */
export function buildMonthlySeries(
  rows: { month: string; verified: boolean; count: number }[],
  bounds: { start: Date; end: Date } | null,
): { points: MonthlyPoint[]; truncated: boolean } {
  if (!bounds && rows.length === 0) return { points: [], truncated: false };
  const months = bounds
    ? monthsBetween(bounds.start, bounds.end)
    : monthsBetween(
        new Date(`${rows[0]!.month}-01T00:00:00Z`),
        new Date(`${rows.at(-1)!.month}-01T00:00:00Z`),
      );
  const truncated = months.length > MAX_SERIES_MONTHS;
  const kept = truncated ? months.slice(-MAX_SERIES_MONTHS) : months;
  const index = new Map(kept.map((m) => [m, { month: m, verified: 0, unverified: 0 }]));
  for (const row of rows) {
    const point = index.get(row.month);
    if (!point) continue;
    if (row.verified) point.verified += row.count;
    else point.unverified += row.count;
  }
  return { points: [...index.values()], truncated };
}

async function monthlyEvidence(
  db: PrismaClient,
  userId: string,
  f: DashboardFilters,
  period: Period,
) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`user_id = ${userId}::uuid`,
    Prisma.sql`"date" IS NOT NULL`,
  ];
  if (period.start && period.end) {
    conditions.push(Prisma.sql`"date" >= ${period.start}::date AND "date" <= ${period.end}::date`);
  }
  if (f.evidenceType) conditions.push(Prisma.sql`type = ${f.evidenceType}::evidence_type`);
  if (f.evidenceVerified !== undefined)
    conditions.push(Prisma.sql`verified = ${f.evidenceVerified}`);
  if (f.evidenceOrigin) conditions.push(Prisma.sql`origin = ${f.evidenceOrigin}::record_origin`);
  const rows = await db.$queryRaw<{ month: string; verified: boolean; count: number }[]>`
    SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month, verified, COUNT(*)::int AS count
    FROM evidence
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY 1, 2
    ORDER BY 1`;
  return buildMonthlySeries(
    rows,
    period.start && period.end ? { start: period.start, end: period.end } : null,
  );
}

export function createDashboardService(db: PrismaClient) {
  async function projectSection(ctx: ServiceContext, f: DashboardFilters, period: Period) {
    const pw = projectWhere(ctx.userId, f);
    const prev = previousPeriod(period);
    const range = dateWhere(period);
    const filtersApplied = appliedFilterLabels(f).projects;
    const [
      base,
      total,
      active,
      production,
      completed,
      completedPrev,
      completedBefore,
      withCompletion,
      health,
      lifecycle,
      attention,
    ] = await Promise.all([
      db.project.count({ where: { userId: ctx.userId } }),
      db.project.count({ where: pw }),
      db.project.count({ where: withStatuses(pw, ACTIVE_STATUSES) }),
      db.project.count({ where: withStatuses(pw, PRODUCTION_STATUSES) }),
      db.project.count({ where: { AND: [pw, { completedAt: range ?? { not: null } }] } }),
      prev
        ? db.project.count({ where: { AND: [pw, { completedAt: dateWhere(prev) }] } })
        : Promise.resolve(0),
      period.start
        ? db.project.count({ where: { AND: [pw, { completedAt: { lt: period.start } }] } })
        : Promise.resolve(0),
      db.project.count({ where: { AND: [pw, { completedAt: { not: null } }] } }),
      db.project.groupBy({ by: ["healthStatus"], where: pw, _count: { _all: true } }),
      db.project.groupBy({ by: ["status"], where: pw, _count: { _all: true } }),
      db.project.findMany({
        where: {
          AND: [
            pw,
            { healthStatus: { in: ["blocked", "at_risk"] } },
            { status: { not: "archived" } },
          ],
        },
        orderBy: [{ healthStatus: "asc" }, { name: "asc" }, { id: "asc" }],
        take: ATTENTION_LIMIT,
        select: { id: true, name: true, healthStatus: true, status: true },
      }),
    ]);
    const hasBase = base > 0;
    const noProjects = "No projects yet.";
    const periodDto = toPeriodDto(period);
    const healthCounts = new Map(health.map((h) => [h.healthStatus, h._count._all]));
    const statusCounts = new Map(lifecycle.map((s) => [s.status, s._count._all]));
    return {
      base,
      attention,
      metrics: {
        total: metricResult("projects.total", {
          value: total,
          hasBaseRecords: hasBase,
          noDataReason: noProjects,
          filtersApplied,
        }),
        active: metricResult("projects.active", {
          value: active,
          hasBaseRecords: hasBase,
          noDataReason: noProjects,
          filtersApplied,
        }),
        production: metricResult("projects.production", {
          value: production,
          hasBaseRecords: hasBase,
          noDataReason: noProjects,
          filtersApplied,
        }),
        completed: metricResult("projects.completed_in_period", {
          value: completed,
          hasBaseRecords: hasBase,
          insufficientReason:
            hasBase && withCompletion === 0 ? "No project has a completion date." : null,
          noDataReason: noProjects,
          period: periodDto,
          comparison: comparisonFor({
            previous: prev ? { value: completedPrev, period: toPeriodDto(prev) } : null,
            hasHistoryBeforePeriod: completedBefore > 0,
            entityLabel: "project completion",
          }),
          filtersApplied,
        }),
        health: metricResult("projects.health_distribution", {
          value: total,
          hasBaseRecords: hasBase,
          noDataReason: noProjects,
          breakdown: HEALTH_ORDER.map((key) => ({
            key,
            label: HEALTH_LABELS[key],
            value: healthCounts.get(key) ?? 0,
          })),
          filtersApplied,
        }),
        lifecycle: metricResult("projects.lifecycle_distribution", {
          value: total,
          hasBaseRecords: hasBase,
          noDataReason: noProjects,
          breakdown: projectStatusSchema.options.map((key) => ({
            key,
            label: humanize(key),
            value: statusCounts.get(key) ?? 0,
          })),
          filtersApplied,
        }),
      },
    };
  }

  async function evidenceSection(ctx: ServiceContext, f: DashboardFilters, period: Period) {
    const ew = evidenceWhere(ctx.userId, f);
    const prev = previousPeriod(period);
    const verifiedWhere: Prisma.EvidenceWhereInput = { AND: [ew, { verified: true }] };
    const filtersApplied = appliedFilterLabels(f).evidence;
    const [base, total, verified, dated, velocity, velocityPrev, velocityBefore, undated, monthly] =
      await Promise.all([
        db.evidence.count({ where: { userId: ctx.userId } }),
        db.evidence.count({ where: ew }),
        db.evidence.count({ where: verifiedWhere }),
        db.evidence.count({ where: { AND: [ew, { date: { not: null } }] } }),
        db.evidence.count({
          where: { AND: [verifiedWhere, { date: dateWhere(period) ?? { not: null } }] },
        }),
        prev
          ? db.evidence.count({ where: { AND: [verifiedWhere, { date: dateWhere(prev) }] } })
          : Promise.resolve(0),
        period.start
          ? db.evidence.count({ where: { AND: [verifiedWhere, { date: { lt: period.start } }] } })
          : Promise.resolve(0),
        db.evidence.count({ where: { AND: [ew, { date: null }] } }),
        monthlyEvidence(db, ctx.userId, f, period),
      ]);
    const hasBase = base > 0;
    const noEvidence = "No evidence yet.";
    return {
      base,
      monthly,
      metrics: {
        total: metricResult("evidence.total", {
          value: total,
          hasBaseRecords: hasBase,
          noDataReason: noEvidence,
          filtersApplied,
        }),
        verified: metricResult("evidence.verified", {
          value: verified,
          hasBaseRecords: hasBase,
          noDataReason: noEvidence,
          filtersApplied,
        }),
        velocity: metricResult("evidence.velocity", {
          value: velocity,
          hasBaseRecords: hasBase,
          insufficientReason:
            hasBase && dated === 0 ? "No evidence matching the filters has a date." : null,
          noDataReason: noEvidence,
          period: toPeriodDto(period),
          comparison: comparisonFor({
            previous: prev ? { value: velocityPrev, period: toPeriodDto(prev) } : null,
            hasHistoryBeforePeriod: velocityBefore > 0,
            entityLabel: "verified evidence",
          }),
          filtersApplied,
        }),
        undated: metricResult("evidence.undated", {
          value: undated,
          hasBaseRecords: hasBase,
          noDataReason: noEvidence,
          filtersApplied,
        }),
      },
    };
  }

  async function skillSection(ctx: ServiceContext, f: DashboardFilters) {
    const sw = skillWhere(ctx.userId, f);
    const filtersApplied = appliedFilterLabels(f).skills;
    const [base, total, active, withTarget, withEvidence, withoutEvidence, categories, top] =
      await Promise.all([
        db.skill.count({ where: { userId: ctx.userId } }),
        db.skill.count({ where: sw }),
        db.skill.count({ where: { AND: [sw, { active: true }] } }),
        db.skill.count({ where: { AND: [sw, { targetLevel: { not: null } }] } }),
        db.skill.count({ where: { AND: [sw, { evidence: { some: {} } }] } }),
        db.skill.count({ where: { AND: [sw, { active: true }, { evidence: { none: {} } }] } }),
        db.skill.groupBy({ by: ["category"], where: sw, _count: { _all: true } }),
        db.skill.findMany({
          where: { AND: [sw, { evidence: { some: {} } }] },
          orderBy: [{ evidence: { _count: "desc" } }, { name: "asc" }, { id: "asc" }],
          take: TOP_SKILLS_LIMIT,
          select: {
            id: true,
            name: true,
            category: true,
            targetLevel: true,
            _count: { select: { evidence: true } },
            evidence: {
              where: { evidence: { date: { not: null } } },
              orderBy: { evidence: { date: "desc" } },
              take: 1,
              select: { evidence: { select: { date: true } } },
            },
          },
        }),
      ]);
    const hasBase = base > 0;
    const noSkills = "No skills yet.";
    const sorted = [...categories].sort(
      (a, b) => b._count._all - a._count._all || (a.category ?? "").localeCompare(b.category ?? ""),
    );
    const named = sorted.filter((c) => c.category !== null);
    const uncategorised = sorted.find((c) => c.category === null)?._count._all ?? 0;
    const shown = named.slice(0, MAX_CATEGORY_BUCKETS);
    const others = named.slice(MAX_CATEGORY_BUCKETS).reduce((sum, c) => sum + c._count._all, 0);
    const breakdown: DistributionBucket[] = [
      ...shown.map((c) => ({ key: c.category!, label: c.category!, value: c._count._all })),
      ...(others > 0
        ? [
            {
              key: "__other__",
              label: `Other categories (${named.length - shown.length})`,
              value: others,
            },
          ]
        : []),
      ...(uncategorised > 0
        ? [{ key: "__none__", label: "Uncategorised", value: uncategorised }]
        : []),
    ];
    return {
      base,
      top: top.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        targetLevel: s.targetLevel,
        evidenceCount: s._count.evidence,
        latestEvidenceDate: toDateOnly(s.evidence[0]?.evidence.date ?? null),
      })),
      metrics: {
        total: metricResult("skills.total", {
          value: total,
          hasBaseRecords: hasBase,
          noDataReason: noSkills,
          filtersApplied,
        }),
        active: metricResult("skills.active", {
          value: active,
          hasBaseRecords: hasBase,
          noDataReason: noSkills,
          filtersApplied,
        }),
        withTarget: metricResult("skills.with_target", {
          value: withTarget,
          hasBaseRecords: hasBase,
          noDataReason: noSkills,
          filtersApplied,
        }),
        withEvidence: metricResult("skills.with_evidence", {
          value: withEvidence,
          hasBaseRecords: hasBase,
          noDataReason: noSkills,
          filtersApplied,
        }),
        withoutEvidence: metricResult("skills.without_evidence", {
          value: withoutEvidence,
          hasBaseRecords: hasBase,
          noDataReason: noSkills,
          filtersApplied,
        }),
        byCategory: metricResult("skills.by_category", {
          value: total,
          hasBaseRecords: hasBase,
          noDataReason: noSkills,
          breakdown,
          filtersApplied,
        }),
      },
    };
  }

  async function certificationSection(ctx: ServiceContext, now: Date) {
    const notRevoked: Prisma.CertificationWhereInput = {
      userId: ctx.userId,
      status: { not: "revoked" },
    };
    const [base, ...buckets] = await Promise.all([
      db.certification.count({ where: { userId: ctx.userId } }),
      ...EXPIRY_ORDER.map((state) =>
        db.certification.count({ where: { AND: [notRevoked, expiryWhere(state, now)] } }),
      ),
    ]);
    const attention = await db.certification.findMany({
      where: {
        AND: [notRevoked, { OR: [expiryWhere("expiring", now), expiryWhere("expired", now)] }],
      },
      orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
      take: ATTENTION_LIMIT,
      select: { id: true, name: true, issuer: true, expiryDate: true },
    });
    const hasBase = base > 0;
    const noCerts = "No certifications yet.";
    const expiring = buckets[1] ?? 0;
    return {
      base,
      attention: attention.map((c) => ({ ...c, expiryDate: toDateOnly(c.expiryDate) })),
      metrics: {
        total: metricResult("certifications.total", {
          value: base,
          hasBaseRecords: hasBase,
          noDataReason: noCerts,
        }),
        expiring: metricResult("certifications.expiring", {
          value: expiring,
          hasBaseRecords: hasBase,
          noDataReason: noCerts,
        }),
        expiry: metricResult("certifications.expiry_distribution", {
          value: buckets.reduce((a, b) => a + b, 0),
          hasBaseRecords: hasBase,
          noDataReason: noCerts,
          breakdown: EXPIRY_ORDER.map((key, i) => ({
            key,
            label: EXPIRY_LABELS[key],
            value: buckets[i] ?? 0,
          })),
        }),
      },
    };
  }

  return {
    /** Everything the Command Center needs in one owner-scoped, bounded request. */
    async dashboard(ctx: ServiceContext, filters: DashboardFilters, now: Date = new Date()) {
      const period = resolvePeriod(filters, now);
      const [
        projects,
        evidence,
        skills,
        certifications,
        technologies,
        experiences,
        education,
        skillIntel,
      ] = await Promise.all([
        projectSection(ctx, filters, period),
        evidenceSection(ctx, filters, period),
        skillSection(ctx, filters),
        certificationSection(ctx, now),
        db.technology.count({ where: { userId: ctx.userId } }),
        db.experience.count({ where: { userId: ctx.userId } }),
        db.education.count({ where: { userId: ctx.userId } }),
        // Phase 4: evidence-derived skill intelligence (same rows as /api/v1/skills/intelligence).
        createSkillsAnalyticsService(db, () => now).summary(ctx, {
          category: filters.skillCategory,
        }),
      ]);
      const recordCounts = {
        projects: projects.base,
        skills: skills.base,
        technologies,
        certifications: certifications.base,
        evidence: evidence.base,
        experiences,
        education,
      };
      // 00 §4 Critical panel: overdue milestones (Phase 3), same rule as the milestones list.
      const overdueMilestones = await db.milestone.findMany({
        where: { AND: [{ userId: ctx.userId }, overdueWhere(now)] },
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        take: ATTENTION_LIMIT,
        select: {
          id: true,
          title: true,
          dueDate: true,
          project: { select: { id: true, name: true } },
        },
      });
      const kpis: MetricResult[] = [
        projects.metrics.active,
        projects.metrics.completed,
        projects.metrics.production,
        evidence.metrics.total,
        evidence.metrics.velocity,
        skills.metrics.withEvidence,
        skillIntel.coverage,
        skillIntel.criticalGaps,
        certifications.metrics.expiring,
      ];
      return {
        calculatedAt: now.toISOString(),
        period: toPeriodDto(period),
        filters: appliedFilterLabels(filters),
        recordCounts,
        hasAnyData: Object.values(recordCounts).some((n) => n > 0),
        kpis,
        projects: {
          ...projects.metrics,
          attention: projects.attention,
          overdueMilestones: overdueMilestones.map((m) => ({
            ...m,
            dueDate: toDateOnly(m.dueDate),
          })),
        },
        evidence: { ...evidence.metrics, monthly: evidence.monthly },
        skills: {
          ...skills.metrics,
          top: skills.top,
          coverage: skillIntel.coverage,
          criticalGaps: skillIntel.criticalGaps,
          gapAttention: skillIntel.attention,
        },
        certifications: { ...certifications.metrics, attention: certifications.attention },
      };
    },
  };
}

export type DashboardDto = Awaited<
  ReturnType<ReturnType<typeof createDashboardService>["dashboard"]>
>;
