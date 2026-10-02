import { Prisma, type PrismaClient, type ProjectStatus } from "@/generated/prisma/client";
import type { EvidenceType, MilestoneStatus } from "@/generated/prisma/enums";
import { metricResult } from "@/modules/analytics/metric-result";
import { overdueWhere } from "@/modules/milestones/milestone.repository";
import { addDays, daysBetween, utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  ACTIVITY_WINDOW_DAYS,
  computeProjectHealth,
  deliveryRate,
  type HealthInputs,
} from "./project-health";
import { ACTIVE_STATUSES, LIFECYCLE_ORDER, PRODUCTION_STATUSES } from "./project.lifecycle";

/**
 * Project intelligence (Phase 3): computed health inputs, milestone delivery, evidence and
 * technology intelligence for the engineering dossier. Every query is owner-scoped and bounded;
 * aggregation happens in PostgreSQL (COUNT / GROUP BY), never by loading rows to count them.
 */
export const DOSSIER_TIMELINE_LIMIT = 10;
export const RELATED_SKILLS_LIMIT = 10;

type MilestoneCounts = HealthInputs["milestones"] & { byStatus: Record<MilestoneStatus, number> };

const emptyCounts = (): MilestoneCounts => ({
  total: 0,
  completed: 0,
  overdue: 0,
  open: 0,
  blocked: 0,
  byStatus: { planned: 0, in_progress: 0, blocked: 0, completed: 0, cancelled: 0 },
});

/** First day of the recent-activity window (inclusive), ACTIVITY_WINDOW_DAYS days ending today. */
export function activityWindowStart(now: Date): Date {
  return addDays(utcDay(now), -(ACTIVITY_WINDOW_DAYS - 1));
}

/**
 * Project-relevant audit events since `from`, per project: events on the project itself plus
 * events on its milestones (matched through the milestone snapshot's projectId, so deleted
 * milestones still count). One parameterised query (Prisma.sql), owner-scoped by actor.
 */
export async function recentEventCounts(
  db: PrismaClient,
  userId: string,
  from: Date,
  projectId?: string,
): Promise<Map<string, number>> {
  const projectKey = Prisma.sql`CASE WHEN entity_type = 'project' THEN entity_id
    ELSE COALESCE("after"->>'projectId', "before"->>'projectId') END`;
  const rows = await db.$queryRaw<{ project_id: string | null; count: number }[]>`
    SELECT ${projectKey} AS project_id, COUNT(*)::int AS count
    FROM audit_logs
    WHERE actor_id = ${userId}::uuid
      AND created_at >= ${from}
      AND entity_type IN ('project', 'milestone')
      ${projectId ? Prisma.sql`AND ${projectKey} = ${projectId}` : Prisma.empty}
    GROUP BY 1`;
  return new Map(rows.filter((r) => r.project_id).map((r) => [r.project_id!, r.count]));
}

/** Milestone counts per project (owner-scoped GROUP BY), including overdue as of `now`. */
export async function milestoneCounts(
  db: PrismaClient,
  userId: string,
  now: Date,
  projectId?: string,
): Promise<Map<string, MilestoneCounts>> {
  const scope = { userId, ...(projectId ? { projectId } : {}) };
  const [byStatus, overdue] = await Promise.all([
    db.milestone.groupBy({ by: ["projectId", "status"], where: scope, _count: { _all: true } }),
    db.milestone.groupBy({
      by: ["projectId"],
      where: { AND: [scope, overdueWhere(now)] },
      _count: { _all: true },
    }),
  ]);
  const result = new Map<string, MilestoneCounts>();
  const get = (id: string) => {
    let c = result.get(id);
    if (!c) result.set(id, (c = emptyCounts()));
    return c;
  };
  for (const row of byStatus) {
    const c = get(row.projectId);
    const n = row._count._all;
    c.byStatus[row.status] += n;
    c.total += n;
    if (row.status === "completed") c.completed += n;
    if (row.status === "blocked") c.blocked += n;
    if (row.status === "planned" || row.status === "in_progress" || row.status === "blocked")
      c.open += n;
  }
  for (const row of overdue) get(row.projectId).overdue = row._count._all;
  return result;
}

export interface HealthProject {
  id: string;
  name: string;
  status: ProjectStatus;
  healthStatus: string;
  targetDate: Date | null;
  completedAt: Date | null;
}

/** Computed health for many projects with a fixed number of queries (no N+1). */
export async function computeHealthForProjects(
  db: PrismaClient,
  userId: string,
  projects: HealthProject[],
  now: Date,
  projectId?: string,
) {
  const [counts, events] = await Promise.all([
    milestoneCounts(db, userId, now, projectId),
    recentEventCounts(db, userId, activityWindowStart(now), projectId),
  ]);
  return projects.map((project) => {
    const m = counts.get(project.id) ?? emptyCounts();
    return {
      project,
      milestones: m,
      health: computeProjectHealth(
        {
          status: project.status,
          targetDate: project.targetDate,
          completedAt: project.completedAt,
          milestones: m,
          recentEvents: events.get(project.id) ?? 0,
        },
        now,
      ),
    };
  });
}

const healthProjectSelect = {
  id: true,
  name: true,
  status: true,
  healthStatus: true,
  targetDate: true,
  completedAt: true,
} as const;

export function createProjectIntelligenceService(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return {
    /** GET /api/v1/projects/:id/intelligence — the analytical half of the engineering dossier. */
    async get(ctx: ServiceContext, projectId: string) {
      const now = clock();
      const userId = ctx.userId;
      const project = requireFound(
        await db.project.findFirst({
          where: { id: projectId, userId },
          select: { ...healthProjectSelect, startDate: true },
        }),
      );
      const linked = {
        userId,
        projects: { some: { projectId } },
      } satisfies Prisma.EvidenceWhereInput;

      const [
        [computed],
        evidenceTotal,
        evidenceVerified,
        evidenceDated,
        evidenceByType,
        evidenceByOrigin,
        timeline,
        relatedSkills,
        usages,
      ] = await Promise.all([
        computeHealthForProjects(db, userId, [project], now, projectId),
        db.evidence.count({ where: linked }),
        db.evidence.count({ where: { ...linked, verified: true } }),
        db.evidence.count({ where: { ...linked, date: { not: null } } }),
        db.evidence.groupBy({ by: ["type"], where: linked, _count: { _all: true } }),
        db.evidence.groupBy({ by: ["origin"], where: linked, _count: { _all: true } }),
        db.evidence.findMany({
          where: { ...linked, date: { not: null } },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }],
          take: DOSSIER_TIMELINE_LIMIT,
          select: { id: true, title: true, type: true, date: true, verified: true, origin: true },
        }),
        db.skillEvidence.groupBy({
          by: ["skillId"],
          where: { userId, evidence: { projects: { some: { projectId } } } },
          _count: { _all: true },
          orderBy: [{ _count: { evidenceId: "desc" } }, { skillId: "asc" }],
          take: RELATED_SKILLS_LIMIT,
        }),
        db.technologyUsage.findMany({
          where: { userId, projectId },
          orderBy: { technology: { name: "asc" } },
          include: {
            technology: { select: { id: true, name: true, version: true, category: true } },
          },
        }),
      ]);

      const [skillNames, otherProjects] = await Promise.all([
        relatedSkills.length
          ? db.skill.findMany({
              where: { userId, id: { in: relatedSkills.map((s) => s.skillId) } },
              select: { id: true, name: true },
            })
          : Promise.resolve([]),
        usages.length
          ? db.technologyUsage.groupBy({
              by: ["technologyId"],
              where: {
                userId,
                technologyId: { in: usages.map((u) => u.technologyId) },
                projectId: { not: projectId },
              },
              _count: { _all: true },
            })
          : Promise.resolve([]),
      ]);
      const nameOf = new Map(skillNames.map((s) => [s.id, s.name]));
      const otherCount = new Map(otherProjects.map((o) => [o.technologyId, o._count._all]));

      const { milestones: m, health } = computed!;
      const hasMilestones = m.total > 0;
      const noMilestones = "No milestones are recorded for this project.";
      const rate = deliveryRate(m);
      const today = utcDay(now);
      const stage = LIFECYCLE_ORDER.indexOf(project.status);
      const hasEvidence = evidenceTotal > 0;
      const noEvidence = "No evidence is linked to this project.";

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(today),
        lifecycle: {
          status: project.status,
          position: stage + 1,
          stages: LIFECYCLE_ORDER,
          group: (ACTIVE_STATUSES as readonly string[]).includes(project.status)
            ? "active"
            : (PRODUCTION_STATUSES as readonly string[]).includes(project.status)
              ? "production"
              : project.status === "archived"
                ? "archived"
                : "idea",
          /** Transition history is not recorded (ADR 0025) — only the current stage is known. */
          historyRecorded: false,
        },
        schedule: {
          startDate: toDateOnly(project.startDate),
          targetDate: toDateOnly(project.targetDate),
          completedAt: toDateOnly(project.completedAt),
          daysToTarget:
            project.targetDate && !project.completedAt
              ? daysBetween(today, project.targetDate)
              : null,
          daysLateAtCompletion:
            project.targetDate && project.completedAt
              ? Math.max(0, daysBetween(project.targetDate, project.completedAt))
              : null,
        },
        health: { manual: project.healthStatus, computed: health },
        milestones: {
          byStatus: m.byStatus,
          total: metricResult("projects.milestones_total", {
            value: m.total,
            hasBaseRecords: hasMilestones,
            noDataReason: noMilestones,
          }),
          completed: metricResult("projects.milestones_completed", {
            value: m.completed,
            hasBaseRecords: hasMilestones,
            noDataReason: noMilestones,
          }),
          overdue: metricResult("projects.milestones_overdue", {
            value: m.overdue,
            hasBaseRecords: hasMilestones,
            noDataReason: noMilestones,
          }),
          blocked: metricResult("projects.milestones_blocked", {
            value: m.blocked,
            hasBaseRecords: hasMilestones,
            noDataReason: noMilestones,
          }),
          deliveryRate: deliveryRateResult(m, hasMilestones, noMilestones, rate),
        },
        evidence: {
          total: metricResult("projects.evidence_linked", {
            value: evidenceTotal,
            hasBaseRecords: hasEvidence,
            noDataReason: noEvidence,
          }),
          verified: metricResult("projects.evidence_verified", {
            value: evidenceVerified,
            hasBaseRecords: hasEvidence,
            noDataReason: noEvidence,
          }),
          dated: evidenceDated,
          undated: evidenceTotal - evidenceDated,
          byType: metricResult("projects.evidence_by_type", {
            value: evidenceTotal,
            hasBaseRecords: hasEvidence,
            noDataReason: noEvidence,
            breakdown: evidenceByType
              .map((t) => ({
                key: t.type as EvidenceType,
                label: t.type,
                value: t._count._all,
              }))
              .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key)),
          }),
          byOrigin: {
            manual: evidenceByOrigin.find((o) => o.origin === "manual")?._count._all ?? 0,
            import: evidenceByOrigin.find((o) => o.origin === "import")?._count._all ?? 0,
          },
          timeline: timeline.map((e) => ({ ...e, date: toDateOnly(e.date)! })),
          relatedSkills: relatedSkills.map((s) => ({
            id: s.skillId,
            name: nameOf.get(s.skillId) ?? "",
            evidenceCount: s._count._all,
          })),
        },
        technologies: usages.map((u) => ({
          ...u.technology,
          usageType: u.usageType,
          otherProjects: otherCount.get(u.technologyId) ?? 0,
        })),
      };
    },
  };
}

/** Delivery rate as a MetricResult: never 0% for an empty denominator (ADR 0024). */
export function deliveryRateResult(
  m: { completed: number; overdue: number },
  hasMilestones: boolean,
  noDataReason: string,
  rate = deliveryRate(m),
) {
  return metricResult("projects.delivery_rate", {
    value: rate ?? 0,
    hasBaseRecords: hasMilestones,
    noDataReason,
    insufficientReason:
      rate === null ? "No milestone is completed or past its planned date yet." : null,
    breakdown: [
      { key: "completed", label: "Completed", value: m.completed },
      { key: "overdue", label: "Overdue", value: m.overdue },
    ],
  });
}

export type ProjectIntelligenceDto = Awaited<
  ReturnType<ReturnType<typeof createProjectIntelligenceService>["get"]>
>;
