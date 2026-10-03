import { Prisma, type Goal, type PrismaClient } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { addDays, utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";
import {
  analyseSkills,
  toIntelligenceRow,
  type SkillIntelligenceRow,
} from "@/modules/skills/skill-intelligence.service";

import {
  attainment,
  goalRisk,
  isGoalOverdue,
  isOpenGoal,
  type Attainment,
  type Risk,
} from "./goal.rules";
import type { ListGoalsQuery } from "./goal.schemas";
import { toGoalDto } from "./goal.service";

/**
 * Goal intelligence (Phase 5, ADR 0033). Every goal's derived signals are computed on request from
 * persisted records with a fixed number of grouped queries (no per-goal query):
 * milestone counts, project facts, dependency facts, latest measurement, and — for skills — the
 * Phase 4 skill-intelligence service (never re-implemented here).
 * There is deliberately no composite "goal progress" number: each signal stands alone.
 */
export interface MilestoneSignal {
  /** Linked milestones excluding cancelled ones. */
  total: number;
  completed: number;
  overdue: number;
  blocked: number;
  /** completed / total; null when total = 0 (not computable). */
  ratio: number | null;
}

export interface GoalSignals {
  milestones: MilestoneSignal;
  projects: { total: number; delivered: number; atRiskOrBlocked: number };
  skills: {
    total: number;
    atOrAbove: number;
    below: number;
    notComputable: number;
    noTarget: number;
    critical: number;
  };
  dependencies: { total: number; blocking: number };
  measurements: { count: number; latest: { date: Date; value: number } | null };
}

export interface AnalysedGoal {
  goal: Goal;
  overdue: boolean;
  signals: GoalSignals;
  attainment: Attainment;
  risk: Risk;
}

const emptySignals = (): GoalSignals => ({
  milestones: { total: 0, completed: 0, overdue: 0, blocked: 0, ratio: null },
  projects: { total: 0, delivered: 0, atRiskOrBlocked: 0 },
  skills: { total: 0, atOrAbove: 0, below: 0, notComputable: 0, noTarget: 0, critical: 0 },
  dependencies: { total: 0, blocking: 0 },
  measurements: { count: 0, latest: null },
});

/** Analyse a set of the caller's goals (filtered by `where`) — bounded by MAX_GOALS_PER_USER. */
export async function analyseGoals(
  db: PrismaClient,
  userId: string,
  now: Date,
  where: Prisma.GoalWhereInput = {},
): Promise<AnalysedGoal[]> {
  return (await analyseGoalsWithSkills(db, userId, now, where)).goals;
}

/** analyseGoals plus the Phase 4 rows of every linked skill (reused by the dossier — one pass). */
export async function analyseGoalsWithSkills(
  db: PrismaClient,
  userId: string,
  now: Date,
  where: Prisma.GoalWhereInput = {},
): Promise<{ goals: AnalysedGoal[]; skillRows: Map<string, SkillIntelligenceRow> }> {
  const today = utcDay(now);
  const goals = await db.goal.findMany({
    where: { ...where, userId },
    orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { title: "asc" }, { id: "asc" }],
  });
  if (goals.length === 0) return { goals: [], skillRows: new Map() };
  const ids = goals.map((g) => g.id);
  // Unfiltered (every goal of the user): scope by owner only instead of a long id list.
  const everyGoal = Object.keys(where).length === 0;
  const inGoals = (column: Prisma.Sql) =>
    everyGoal
      ? Prisma.empty
      : Prisma.sql`AND ${column} IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
  const goalIdFilter = everyGoal ? {} : { goalId: { in: ids } };

  const [milestones, projects, goalSkills, dependencies, latest, counts] = await Promise.all([
    // Overdue mirrors Phase 3 (ADR 0022): open, due before today, project not archived.
    db.$queryRaw<
      { goal_id: string; total: number; completed: number; overdue: number; blocked: number }[]
    >`
      SELECT m.goal_id,
        COUNT(*) FILTER (WHERE m.status <> 'cancelled')::int AS total,
        COUNT(*) FILTER (WHERE m.status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE m.status IN ('planned', 'in_progress', 'blocked')
                           AND m.due_date < ${today}::date AND p.status <> 'archived')::int AS overdue,
        COUNT(*) FILTER (WHERE m.status = 'blocked')::int AS blocked
      FROM milestones m JOIN projects p ON p.id = m.project_id AND p.user_id = m.user_id
      WHERE m.user_id = ${userId}::uuid AND m.goal_id IS NOT NULL ${inGoals(Prisma.sql`m.goal_id`)}
      GROUP BY m.goal_id`,
    db.$queryRaw<{ goal_id: string; total: number; delivered: number; at_risk: number }[]>`
      SELECT gp.goal_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE p.completed_at IS NOT NULL OR p.status IN ('production', 'maintenance'))::int AS delivered,
        COUNT(*) FILTER (WHERE p.health_status IN ('at_risk', 'blocked') AND p.status <> 'archived')::int AS at_risk
      FROM goal_projects gp JOIN projects p ON p.id = gp.project_id AND p.user_id = gp.user_id
      WHERE gp.user_id = ${userId}::uuid ${inGoals(Prisma.sql`gp.goal_id`)}
      GROUP BY gp.goal_id`,
    db.goalSkill.findMany({
      where: { userId, ...goalIdFilter },
      select: { goalId: true, skillId: true },
    }),
    db.$queryRaw<{ goal_id: string; total: number; blocking: number }[]>`
      SELECT d.goal_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE g.status = 'cancelled'
          OR (g.status IN ('active', 'on_hold') AND g.deadline < ${today}::date))::int AS blocking
      FROM goal_dependencies d JOIN goals g ON g.id = d.depends_on_goal_id AND g.user_id = d.user_id
      WHERE d.user_id = ${userId}::uuid ${inGoals(Prisma.sql`d.goal_id`)}
      GROUP BY d.goal_id`,
    db.$queryRaw<{ goal_id: string; date: Date; value: number }[]>`
      SELECT DISTINCT ON (goal_id) goal_id, date, value
      FROM goal_measurements
      WHERE user_id = ${userId}::uuid ${inGoals(Prisma.sql`goal_id`)} AND date <= ${today}::date
      ORDER BY goal_id, date DESC, created_at DESC, id`,
    db.goalMeasurement.groupBy({
      by: ["goalId"],
      where: { userId, ...goalIdFilter },
      _count: { _all: true },
    }),
  ]);

  // Skill readiness from Phase 4 skill intelligence (single source of truth for levels and gaps).
  const skillIds = [...new Set(goalSkills.map((g) => g.skillId))];
  const skillRows = new Map<string, SkillIntelligenceRow>();
  if (skillIds.length) {
    for (const a of await analyseSkills(db, userId, now, { id: { in: skillIds } })) {
      skillRows.set(a.skill.id, toIntelligenceRow(a));
    }
  }

  const signals = new Map<string, GoalSignals>(ids.map((id) => [id, emptySignals()]));
  for (const r of milestones) {
    signals.get(r.goal_id)!.milestones = {
      total: r.total,
      completed: r.completed,
      overdue: r.overdue,
      blocked: r.blocked,
      ratio: r.total ? r.completed / r.total : null,
    };
  }
  for (const r of projects) {
    signals.get(r.goal_id)!.projects = {
      total: r.total,
      delivered: r.delivered,
      atRiskOrBlocked: r.at_risk,
    };
  }
  for (const gs of goalSkills) {
    const s = signals.get(gs.goalId)!.skills;
    const row = skillRows.get(gs.skillId);
    s.total += 1;
    if (!row) continue;
    if (row.gap.state === "at_target" || row.gap.state === "above_target") s.atOrAbove += 1;
    else if (row.gap.state === "below_target") s.below += 1;
    else if (row.gap.state === "not_computable") s.notComputable += 1;
    else s.noTarget += 1;
    if (row.gap.critical) s.critical += 1;
  }
  for (const r of dependencies)
    signals.get(r.goal_id)!.dependencies = { total: r.total, blocking: r.blocking };
  const countOf = new Map(counts.map((c) => [c.goalId, c._count._all]));
  for (const r of latest)
    signals.get(r.goal_id)!.measurements.latest = { date: r.date, value: r.value };
  for (const [id, n] of countOf) signals.get(id)!.measurements.count = n;

  const analysed = goals.map((goal) => {
    const s = signals.get(goal.id)!;
    const att = attainment(goal, s.measurements.latest);
    return {
      goal,
      overdue: isGoalOverdue(goal, now),
      signals: s,
      attainment: att,
      risk: goalRisk(
        {
          status: goal.status,
          deadline: goal.deadline,
          milestones: s.milestones,
          projects: s.projects,
          skills: s.skills,
          dependencies: s.dependencies,
          attainment: att.state,
          hasMeasurements: s.measurements.count > 0,
        },
        now,
      ),
    };
  });
  return { goals: analysed, skillRows };
}

/** Compact row for lists, analytics and the roadmap. */
export function toGoalRow(a: AnalysedGoal) {
  return {
    ...toGoalDto(a.goal),
    overdue: a.overdue,
    risk: { state: a.risk.state, signals: a.risk.signals.length },
    attainment: { state: a.attainment.state, progress: a.attainment.progress },
    milestones: a.signals.milestones,
    counts: {
      projects: a.signals.projects.total,
      skills: a.signals.skills.total,
      skillsBelowTarget: a.signals.skills.below,
      dependencies: a.signals.dependencies.total,
    },
  };
}

export type GoalRow = ReturnType<typeof toGoalRow>;

/** Structural filters that PostgreSQL evaluates (owner scope is always added). */
export function goalWhere(q: Partial<ListGoalsQuery>): Prisma.GoalWhereInput {
  const and: Prisma.GoalWhereInput[] = [];
  if (q.q) {
    const term = {
      contains: escapeLike(q.q),
      mode: "insensitive" as const,
    };
    and.push({ OR: [{ title: term }, { description: term }, { outcome: term }, { metric: term }] });
  }
  if (q.status) and.push({ status: q.status });
  if (q.type) and.push({ type: q.type });
  if (q.open !== undefined)
    and.push({ status: q.open ? { in: ["active", "on_hold"] } : { notIn: ["active", "on_hold"] } });
  if (q.committed !== undefined) {
    const committed = ["active", "on_hold", "completed"] as const;
    and.push({ status: q.committed ? { in: [...committed] } : { notIn: [...committed] } });
  }
  if (q.parentId) and.push({ parentId: q.parentId });
  if (q.root !== undefined) and.push({ parentId: q.root ? null : { not: null } });
  if (q.projectId) and.push({ projects: { some: { projectId: q.projectId } } });
  if (q.skillId) and.push({ skills: { some: { skillId: q.skillId } } });
  if (q.hasDeadline !== undefined) and.push({ deadline: q.hasDeadline ? { not: null } : null });
  if (q.hasProjects !== undefined)
    and.push({ projects: q.hasProjects ? { some: {} } : { none: {} } });
  if (q.hasSkills !== undefined) and.push({ skills: q.hasSkills ? { some: {} } : { none: {} } });
  if (q.deadlineFrom || q.deadlineTo)
    and.push({ deadline: { gte: q.deadlineFrom, lte: q.deadlineTo } });
  if (q.completedFrom || q.completedTo)
    and.push({ completedAt: { gte: q.completedFrom, lte: q.completedTo } });
  return and.length ? { AND: and } : {};
}

/** Derived filters (same predicate for the list and the metrics — exact reconciliation). */
export function matchesDerived(a: AnalysedGoal, q: Partial<ListGoalsQuery>): boolean {
  if (q.overdue !== undefined && a.overdue !== q.overdue) return false;
  if (q.risk && a.risk.state !== q.risk) return false;
  if (q.attainment && a.attainment.state !== q.attainment) return false;
  if (q.skillGap !== undefined && a.signals.skills.below > 0 !== q.skillGap) return false;
  return true;
}

const RISK_ORDER = { at_risk: 0, on_track: 1, not_assessable: 2, not_applicable: 3 } as const;

export function sortGoals(rows: AnalysedGoal[], sort: ListGoalsQuery["sort"]) {
  const t = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY);
  const tie = (a: AnalysedGoal, b: AnalysedGoal) =>
    a.goal.title.localeCompare(b.goal.title) || a.goal.id.localeCompare(b.goal.id);
  const cmp: Record<typeof sort, (a: AnalysedGoal, b: AnalysedGoal) => number> = {
    deadline: (a, b) => t(a.goal.deadline) - t(b.goal.deadline) || tie(a, b),
    title: tie,
    status: (a, b) => a.goal.status.localeCompare(b.goal.status) || tie(a, b),
    updatedAt: (a, b) => b.goal.updatedAt.getTime() - a.goal.updatedAt.getTime() || tie(a, b),
    risk: (a, b) =>
      RISK_ORDER[a.risk.state] - RISK_ORDER[b.risk.state] ||
      b.risk.signals.length - a.risk.signals.length ||
      tie(a, b),
  };
  return [...rows].sort(cmp[sort]);
}

export function createGoalIntelligenceService(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return {
    /** GET /api/v1/goals — server-side filtering (structural in SQL, derived on the analysed set). */
    async list(ctx: ServiceContext, query: ListGoalsQuery) {
      const now = clock();
      const analysed = (await analyseGoals(db, ctx.userId, now, goalWhere(query))).filter((a) =>
        matchesDerived(a, query),
      );
      const sorted = sortGoals(analysed, query.sort);
      const start = (query.page - 1) * query.pageSize;
      return {
        data: sorted.slice(start, start + query.pageSize).map(toGoalRow),
        page: {
          page: query.page,
          pageSize: query.pageSize,
          total: sorted.length,
          totalPages: Math.max(1, Math.ceil(sorted.length / query.pageSize)),
        },
        evaluatedOn: toDateOnly(utcDay(now))!,
      };
    },

    /** GET /api/v1/goals/:id/intelligence — the goal dossier's analytical content. */
    async get(ctx: ServiceContext, id: string) {
      const now = clock();
      const userId = ctx.userId;
      const { goals: found, skillRows } = await analyseGoalsWithSkills(db, userId, now, { id });
      const a = requireFound(found[0]);
      const [
        parent,
        children,
        projectLinks,
        skillLinks,
        milestones,
        dependsOn,
        dependents,
        measurements,
      ] = await Promise.all([
        a.goal.parentId
          ? db.goal.findFirst({
              where: { id: a.goal.parentId, userId },
              select: { id: true, title: true, type: true, status: true },
            })
          : Promise.resolve(null),
        db.goal.findMany({
          where: { userId, parentId: id },
          orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { title: "asc" }, { id: "asc" }],
          select: { id: true, title: true, type: true, status: true, deadline: true },
        }),
        // Driven from the link table's primary key (goal_id, project_id): a stable plan even with
        // stale planner statistics (a projects-side semi-join regressed to ~1.3 s; report §29).
        db.goalProject.findMany({
          where: { userId, goalId: id },
          select: {
            project: {
              select: {
                id: true,
                name: true,
                status: true,
                healthStatus: true,
                completedAt: true,
                _count: { select: { milestones: true, evidence: true } },
              },
            },
          },
        }),
        db.goalSkill.findMany({ where: { userId, goalId: id }, select: { skillId: true } }),
        db.milestone.findMany({
          where: { userId, goalId: id },
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }, { id: "asc" }],
          include: { project: { select: { id: true, name: true, status: true } } },
        }),
        db.goal.findMany({
          where: { userId, dependents: { some: { goalId: id } } },
          orderBy: [{ title: "asc" }, { id: "asc" }],
          select: { id: true, title: true, status: true, deadline: true },
        }),
        db.goal.findMany({
          where: { userId, dependsOn: { some: { dependsOnGoalId: id } } },
          orderBy: [{ title: "asc" }, { id: "asc" }],
          select: { id: true, title: true, status: true, deadline: true },
        }),
        db.goalMeasurement.findMany({
          where: { userId, goalId: id },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          take: 1000,
          select: { id: true, date: true, value: true, note: true },
        }),
      ]);
      // Same Phase 4 rows the goal's skill signals were computed from (one analysis, ADR 0032).
      const skills = skillLinks
        .map((l) => skillRows.get(l.skillId)!)
        .sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id));
      const today = utcDay(now);
      const overdueM = (m: (typeof milestones)[number]) =>
        ["planned", "in_progress", "blocked"].includes(m.status) &&
        m.dueDate !== null &&
        m.dueDate < today &&
        m.project.status !== "archived";
      const depState = (g: { status: string; deadline: Date | null }) =>
        g.status === "cancelled"
          ? "cancelled"
          : isOpenGoal(g.status as never) && g.deadline && g.deadline < today
            ? "overdue"
            : g.status;

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(today)!,
        goal: toGoalDto(a.goal),
        overdue: a.overdue,
        attainment: a.attainment,
        risk: a.risk,
        signals: {
          ...a.signals,
          measurements: {
            count: a.signals.measurements.count,
            latest: a.signals.measurements.latest
              ? {
                  date: toDateOnly(a.signals.measurements.latest.date)!,
                  value: a.signals.measurements.latest.value,
                }
              : null,
          },
        },
        parent,
        children: children.map((c) => ({ ...c, deadline: toDateOnly(c.deadline) })),
        projects: projectLinks
          .map((l) => ({ ...l.project, completedAt: toDateOnly(l.project.completedAt) }))
          .sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id)),
        skills,
        milestones: milestones.map((m) => ({
          id: m.id,
          title: m.title,
          status: m.status,
          dueDate: toDateOnly(m.dueDate),
          completedAt: toDateOnly(m.completedAt),
          overdue: overdueM(m),
          project: { id: m.project.id, name: m.project.name },
        })),
        dependsOn: dependsOn.map((g) => ({
          ...g,
          deadline: toDateOnly(g.deadline),
          state: depState(g),
        })),
        dependents: dependents.map((g) => ({ ...g, deadline: toDateOnly(g.deadline) })),
        measurements: measurements.map((m) => ({
          ...m,
          date: toDateOnly(m.date)!,
          future: m.date > today,
        })),
      };
    },
  };
}

export type GoalDossierDto = Awaited<
  ReturnType<ReturnType<typeof createGoalIntelligenceService>["get"]>
>;

/** Quarter key "YYYY-Qn" of a UTC date, and its inclusive bounds. */
export function quarterOf(date: Date): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

export function quarterBounds(key: string): { from: Date; to: Date } {
  const [y, q] = key.split("-Q").map(Number);
  const from = new Date(Date.UTC(y!, (q! - 1) * 3, 1));
  const to = addDays(new Date(Date.UTC(y!, q! * 3, 1)), -1);
  return { from, to };
}

export function quartersBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cursor = quarterBounds(quarterOf(from)).from;
  while (cursor.getTime() <= to.getTime() && keys.length < 40) {
    keys.push(quarterOf(cursor));
    cursor = addDays(quarterBounds(quarterOf(cursor)).to, 1);
  }
  return keys;
}
