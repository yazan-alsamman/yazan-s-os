import { z } from "zod";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { booleanQuerySchema, paginationQuerySchema } from "@/lib/http/pagination";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import { CUSTOM_LEVEL_MODEL_ID, DEFAULT_LEVEL_MODEL, type SkillLevel } from "./level-models";
import {
  analyseSkill,
  emptySignals,
  trendWindows,
  type SkillAnalysis,
  type SkillSignals,
} from "./skill-intelligence";

/**
 * Skill intelligence data access (Phase 4, ADR 0027). Signals for any number of skills are loaded
 * with three grouped, parameterised aggregates (evidence links, project links, certification
 * links) — never one query per skill — and analysed by the pure functions in
 * `skill-intelligence.ts`. Nothing is persisted; results are recomputed on request.
 */
export const MAX_RADAR_SKILLS = 12;
export const YEARS_SHOWN = 6;
export const DOSSIER_EVIDENCE_LIMIT = 100;

interface EvidenceRow {
  skill_id: string;
  total: number;
  qualifying: number;
  qualifying_verified: number;
  strong: number;
  strong_verified: number;
  production_metric: number;
  recognition: number;
  latest: Date | null;
  earliest: Date | null;
  dated: number;
  undated: number;
  future: number;
  recent: number;
  previous: number;
}

const DEMO_DATE = Prisma.sql`COALESCE(se.date, e.date)`;

/** Load signals for the caller's skills (optionally one skill). Owner-scoped in every query. */
export async function loadSignals(
  db: PrismaClient,
  userId: string,
  now: Date,
  skillId?: string,
): Promise<Map<string, SkillSignals> & { linkedCertifications: Map<string, number> }> {
  const { today, recentStart, previousStart, previousEnd } = trendWindows(now);
  const onlySkill = (column: Prisma.Sql) =>
    skillId ? Prisma.sql`AND ${column} = ${skillId}::uuid` : Prisma.empty;
  const [evidence, projects, certifications] = await Promise.all([
    db.$queryRaw<EvidenceRow[]>`
      SELECT se.skill_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE se.strength IN ('moderate', 'strong'))::int AS qualifying,
        COUNT(*) FILTER (WHERE se.strength IN ('moderate', 'strong') AND e.verified)::int AS qualifying_verified,
        COUNT(*) FILTER (WHERE se.strength = 'strong')::int AS strong,
        COUNT(*) FILTER (WHERE se.strength = 'strong' AND e.verified)::int AS strong_verified,
        COUNT(*) FILTER (WHERE se.strength IN ('moderate', 'strong') AND e.type = 'production_metric')::int AS production_metric,
        COUNT(*) FILTER (WHERE e.verified AND e.type IN ('testimonial', 'publication'))::int AS recognition,
        MAX(${DEMO_DATE}) FILTER (WHERE ${DEMO_DATE} <= ${today}::date) AS latest,
        MIN(${DEMO_DATE}) FILTER (WHERE ${DEMO_DATE} <= ${today}::date) AS earliest,
        COUNT(*) FILTER (WHERE ${DEMO_DATE} <= ${today}::date)::int AS dated,
        COUNT(*) FILTER (WHERE ${DEMO_DATE} IS NULL)::int AS undated,
        COUNT(*) FILTER (WHERE ${DEMO_DATE} > ${today}::date)::int AS future,
        COUNT(*) FILTER (WHERE ${DEMO_DATE} BETWEEN ${recentStart}::date AND ${today}::date)::int AS recent,
        COUNT(*) FILTER (WHERE ${DEMO_DATE} BETWEEN ${previousStart}::date AND ${previousEnd}::date)::int AS previous
      FROM skill_evidence se
      JOIN evidence e ON e.id = se.evidence_id AND e.user_id = se.user_id
      WHERE se.user_id = ${userId}::uuid ${onlySkill(Prisma.sql`se.skill_id`)}
      GROUP BY se.skill_id`,
    db.$queryRaw<{ skill_id: string; total: number; delivered: number; production: number }[]>`
      SELECT ps.skill_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE p.status IN ('development', 'validation', 'production', 'maintenance')
                           OR p.completed_at IS NOT NULL)::int AS delivered,
        COUNT(*) FILTER (WHERE p.status IN ('production', 'maintenance'))::int AS production
      FROM project_skills ps
      JOIN projects p ON p.id = ps.project_id AND p.user_id = ps.user_id
      WHERE ps.user_id = ${userId}::uuid ${onlySkill(Prisma.sql`ps.skill_id`)}
      GROUP BY ps.skill_id`,
    db.$queryRaw<{ skill_id: string; earned: number; in_progress: number; linked: number }[]>`
      SELECT cs.skill_id,
        COUNT(*) FILTER (WHERE c.status = 'earned')::int AS earned,
        COUNT(*) FILTER (WHERE c.status = 'in_progress')::int AS in_progress,
        COUNT(*)::int AS linked
      FROM certification_skills cs
      JOIN certifications c ON c.id = cs.certification_id AND c.user_id = cs.user_id
      WHERE cs.user_id = ${userId}::uuid ${onlySkill(Prisma.sql`cs.skill_id`)}
      GROUP BY cs.skill_id`,
  ]);
  const result = new Map<string, SkillSignals>() as Map<string, SkillSignals> & {
    linkedCertifications: Map<string, number>;
  };
  result.linkedCertifications = new Map();
  const get = (id: string) => {
    let s = result.get(id);
    if (!s) result.set(id, (s = emptySignals()));
    return s;
  };
  for (const r of evidence) {
    const s = get(r.skill_id);
    s.evidence = {
      total: r.total,
      qualifying: r.qualifying,
      qualifyingVerified: r.qualifying_verified,
      strong: r.strong,
      strongVerified: r.strong_verified,
      productionMetric: r.production_metric,
      recognition: r.recognition,
    };
    s.demonstrations = {
      latest: r.latest,
      earliest: r.earliest,
      dated: r.dated,
      undated: r.undated,
      future: r.future,
      recentWindow: r.recent,
      previousWindow: r.previous,
    };
  }
  for (const r of projects) {
    get(r.skill_id).projects = { total: r.total, delivered: r.delivered, production: r.production };
  }
  for (const r of certifications) {
    get(r.skill_id).certifications = { earned: r.earned, inProgress: r.in_progress };
    result.linkedCertifications.set(r.skill_id, r.linked);
  }
  return result;
}

const skillSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  active: true,
  targetLevel: true,
  levelModel: true,
  levelModelId: true,
} as const;

type SkillRow = Prisma.SkillGetPayload<{ select: typeof skillSelect }>;

export interface AnalysedSkill {
  skill: SkillRow;
  signals: SkillSignals;
  analysis: SkillAnalysis;
  levels: SkillLevel[];
  levelModelName: string;
}

/** Analyse a set of skills (default: all of the caller's) with a fixed number of queries. */
export async function analyseSkills(
  db: PrismaClient,
  userId: string,
  now: Date,
  where: Prisma.SkillWhereInput = {},
  skillId?: string,
): Promise<AnalysedSkill[]> {
  const [skills, signals, models] = await Promise.all([
    db.skill.findMany({
      where: { ...where, userId, ...(skillId ? { id: skillId } : {}) },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: skillSelect,
    }),
    loadSignals(db, userId, now, skillId),
    db.skillLevelModel.findMany({
      where: { userId },
      select: { id: true, name: true, levels: true },
    }),
  ]);
  const modelById = new Map(models.map((m) => [m.id, m]));
  return skills.map((skill) => {
    const s = signals.get(skill.id) ?? emptySignals();
    const custom =
      skill.levelModel === CUSTOM_LEVEL_MODEL_ID && skill.levelModelId
        ? modelById.get(skill.levelModelId)
        : undefined;
    const analysis = analyseSkill(skill, s, now);
    // A skill whose only links are planned/revoked certifications has records but no level.
    if (
      analysis.derived.state === "no_evidence" &&
      (signals.linkedCertifications.get(skill.id) ?? 0) > 0
    ) {
      analysis.derived.state = "insufficient_evidence";
      analysis.derived.explanation =
        "Only planned or revoked certifications are linked; they do not establish a level.";
    }
    return {
      skill,
      signals: s,
      analysis,
      levels: custom ? (custom.levels as unknown as SkillLevel[]) : [...DEFAULT_LEVEL_MODEL.levels],
      levelModelName: custom ? custom.name : DEFAULT_LEVEL_MODEL.name,
    };
  });
}

export function levelLabelOf(levels: SkillLevel[], value: number | null): string | null {
  if (value === null) return null;
  return levels.find((l) => l.value === value)?.label ?? String(value);
}

/** Compact, safe row for lists, heatmap and radar. */
export function toIntelligenceRow(a: AnalysedSkill) {
  const { skill, analysis, signals } = a;
  return {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    active: skill.active,
    levelModelName: a.levelModelName,
    target: { level: skill.targetLevel, label: levelLabelOf(a.levels, skill.targetLevel) },
    current: {
      level: analysis.derived.level,
      label: levelLabelOf(a.levels, analysis.derived.level),
      state: analysis.derived.state,
    },
    gap: {
      state: analysis.gap.state,
      value: analysis.gap.gap,
      critical: analysis.gap.critical,
      targetWithoutEvidence: analysis.gap.targetWithoutEvidence,
    },
    freshness: {
      state: analysis.freshness.state,
      latest: analysis.freshness.latest,
      daysSince: analysis.freshness.daysSince,
    },
    trend: analysis.trend.state,
    counts: {
      evidence: signals.evidence.total,
      verified: signals.evidence.qualifyingVerified,
      projects: signals.projects.total,
      certifications: signals.certifications.earned,
      productionLinked: analysis.productionLinked,
      undated: signals.demonstrations.undated,
    },
  };
}

export type SkillIntelligenceRow = ReturnType<typeof toIntelligenceRow>;

// ── Source list (heatmap / drill-down target) ───────────────────────────────

const FRESHNESS = ["fresh", "aging", "stale", "no_dated_evidence", "no_evidence"] as const;
const GAP_STATES = [
  "below_target",
  "at_target",
  "above_target",
  "not_computable",
  "no_target",
] as const;
const TRENDS = ["increasing", "stable", "decreasing", "insufficient_history"] as const;
const LEVELS = ["1", "2", "3", "4", "5", "none"] as const;

export const skillIntelligenceQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(1).max(80).optional(),
  active: booleanQuerySchema,
  hasTarget: booleanQuerySchema,
  level: z.enum(LEVELS).optional(),
  freshness: z.enum(FRESHNESS).optional(),
  gap: z.enum(GAP_STATES).optional(),
  critical: booleanQuerySchema,
  targetWithoutEvidence: booleanQuerySchema,
  trend: z.enum(TRENDS).optional(),
  productionLinked: booleanQuerySchema,
  sort: z.enum(["gap", "name", "freshness", "level", "evidence"]).default("gap"),
});

export type SkillIntelligenceQuery = z.infer<typeof skillIntelligenceQuerySchema>;

/** Filter predicate shared by the list endpoint and the metric calculators (exact reconciliation). */
export function matchesQuery(
  row: SkillIntelligenceRow,
  q: Omit<SkillIntelligenceQuery, "page" | "pageSize" | "sort">,
): boolean {
  if (q.active !== undefined && row.active !== q.active) return false;
  if (
    q.hasTarget !== undefined &&
    (row.target.level !== null && row.target.level >= 1) !== q.hasTarget
  )
    return false;
  if (q.level && (row.current.level === null ? "none" : String(row.current.level)) !== q.level)
    return false;
  if (q.freshness && row.freshness.state !== q.freshness) return false;
  if (q.gap && row.gap.state !== q.gap) return false;
  if (q.critical !== undefined && row.gap.critical !== q.critical) return false;
  if (
    q.targetWithoutEvidence !== undefined &&
    row.gap.targetWithoutEvidence !== q.targetWithoutEvidence
  )
    return false;
  if (q.trend && row.trend !== q.trend) return false;
  if (q.productionLinked !== undefined && row.counts.productionLinked > 0 !== q.productionLinked)
    return false;
  return true;
}

const FRESH_ORDER: Record<string, number> = {
  stale: 0,
  aging: 1,
  no_dated_evidence: 2,
  no_evidence: 3,
  fresh: 4,
};

export function sortRows(rows: SkillIntelligenceRow[], sort: SkillIntelligenceQuery["sort"]) {
  const byName = (a: SkillIntelligenceRow, b: SkillIntelligenceRow) =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const cmp: Record<typeof sort, (a: SkillIntelligenceRow, b: SkillIntelligenceRow) => number> = {
    // Largest gap first; critical first; not-computable after computable gaps.
    gap: (a, b) =>
      Number(b.gap.critical) - Number(a.gap.critical) ||
      (b.gap.value ?? -99) - (a.gap.value ?? -99) ||
      byName(a, b),
    name: byName,
    freshness: (a, b) =>
      FRESH_ORDER[a.freshness.state]! - FRESH_ORDER[b.freshness.state]! ||
      (b.freshness.daysSince ?? 0) - (a.freshness.daysSince ?? 0) ||
      byName(a, b),
    level: (a, b) => (b.current.level ?? 0) - (a.current.level ?? 0) || byName(a, b),
    evidence: (a, b) => b.counts.evidence - a.counts.evidence || byName(a, b),
  };
  return [...rows].sort(cmp[sort]);
}

export function createSkillIntelligenceService(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return {
    /** GET /api/v1/skills/intelligence — the filterable, sortable source list (heatmap rows). */
    async list(ctx: ServiceContext, query: SkillIntelligenceQuery) {
      const now = clock();
      const where: Prisma.SkillWhereInput = query.category
        ? { category: { equals: query.category, mode: "insensitive" } }
        : {};
      const rows = (await analyseSkills(db, ctx.userId, now, where))
        .map(toIntelligenceRow)
        .filter((r) => matchesQuery(r, query));
      const sorted = sortRows(rows, query.sort);
      const start = (query.page - 1) * query.pageSize;
      return {
        data: sorted.slice(start, start + query.pageSize),
        page: {
          page: query.page,
          pageSize: query.pageSize,
          total: sorted.length,
          totalPages: Math.max(1, Math.ceil(sorted.length / query.pageSize)),
        },
        evaluatedOn: toDateOnly(utcDay(now)),
      };
    },

    /** GET /api/v1/skills/:id/intelligence — the analytical half of the skill dossier. */
    async get(ctx: ServiceContext, skillId: string) {
      const now = clock();
      const userId = ctx.userId;
      const [analysed] = await analyseSkills(db, userId, now, {}, skillId);
      const a = requireFound(analysed);
      const linked = { userId, skills: { some: { skillId } } } satisfies Prisma.EvidenceWhereInput;
      const yearsFrom = new Date(Date.UTC(utcDay(now).getUTCFullYear() - (YEARS_SHOWN - 1), 0, 1));

      const [links, projects, certifications, explicitTech, projectTech, experiences, yearly] =
        await Promise.all([
          db.skillEvidence.findMany({
            where: { userId, skillId },
            take: DOSSIER_EVIDENCE_LIMIT,
            // Approximates ORDER BY COALESCE(link date, evidence date); re-sorted exactly below.
            orderBy: [
              { date: { sort: "desc", nulls: "last" } },
              { evidence: { date: { sort: "desc", nulls: "last" } } },
              { evidenceId: "asc" },
            ],
            select: {
              strength: true,
              date: true,
              evidence: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  date: true,
                  verified: true,
                  origin: true,
                },
              },
            },
          }),
          db.project.findMany({
            where: { userId, skills: { some: { skillId } } },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: { id: true, name: true, status: true, completedAt: true },
          }),
          db.certification.findMany({
            where: { userId, skills: { some: { skillId } } },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: {
              id: true,
              name: true,
              issuer: true,
              status: true,
              issueDate: true,
              expiryDate: true,
            },
          }),
          db.technology.findMany({
            where: { userId, skills: { some: { skillId } } },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: { id: true, name: true, version: true, category: true },
          }),
          // Technologies used in projects that demonstrate this skill (a real two-hop path).
          db.technologyUsage.groupBy({
            by: ["technologyId"],
            where: { userId, project: { skills: { some: { skillId } } } },
            _count: { _all: true },
            orderBy: [{ _count: { projectId: "desc" } }, { technologyId: "asc" }],
            take: 20,
          }),
          // Experiences whose evidence demonstrates this skill (experience ↔ evidence ↔ skill).
          db.experience.findMany({
            where: { userId, evidence: { some: { evidence: linked } } },
            orderBy: [{ startDate: "desc" }, { id: "asc" }],
            select: { id: true, title: true, organization: true, startDate: true, endDate: true },
          }),
          db.$queryRaw<{ year: number; count: number; strong: number }[]>`
            SELECT EXTRACT(YEAR FROM ${DEMO_DATE})::int AS year,
                   COUNT(*)::int AS count,
                   COUNT(*) FILTER (WHERE se.strength = 'strong')::int AS strong
            FROM skill_evidence se
            JOIN evidence e ON e.id = se.evidence_id AND e.user_id = se.user_id
            WHERE se.user_id = ${userId}::uuid AND se.skill_id = ${skillId}::uuid
              AND ${DEMO_DATE} >= ${yearsFrom}::date AND ${DEMO_DATE} <= ${utcDay(now)}::date
            GROUP BY 1 ORDER BY 1`,
        ]);
      const techNames = projectTech.length
        ? await db.technology.findMany({
            where: { userId, id: { in: projectTech.map((t) => t.technologyId) } },
            select: { id: true, name: true },
          })
        : [];
      const techName = new Map(techNames.map((t) => [t.id, t.name]));
      const byYear = new Map(yearly.map((y) => [y.year, y]));
      const thisYear = utcDay(now).getUTCFullYear();

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(utcDay(now)),
        row: toIntelligenceRow(a),
        levelModel: { name: a.levelModelName, levels: a.levels },
        derived: a.analysis.derived,
        freshness: a.analysis.freshness,
        trend: a.analysis.trend,
        gap: a.analysis.gap,
        signals: {
          ...a.signals,
          demonstrations: {
            ...a.signals.demonstrations,
            latest: toDateOnly(a.signals.demonstrations.latest),
            earliest: toDateOnly(a.signals.demonstrations.earliest),
          },
        },
        evidence: {
          shown: links.length,
          total: a.signals.evidence.total,
          items: links
            .map((l) => ({
              ...l.evidence,
              date: toDateOnly(l.evidence.date),
              strength: l.strength,
              demonstratedOn: toDateOnly(l.date ?? l.evidence.date),
              future: Boolean(
                (l.date ?? l.evidence.date) && (l.date ?? l.evidence.date)! > utcDay(now),
              ),
            }))
            // Newest demonstration first; undated last; then title and id (deterministic).
            .sort(
              (a, b) =>
                (b.demonstratedOn ?? "").localeCompare(a.demonstratedOn ?? "") ||
                a.title.localeCompare(b.title) ||
                a.id.localeCompare(b.id),
            ),
        },
        yearly: Array.from({ length: YEARS_SHOWN }, (_, i) => {
          const year = thisYear - (YEARS_SHOWN - 1) + i;
          return {
            year,
            count: byYear.get(year)?.count ?? 0,
            strong: byYear.get(year)?.strong ?? 0,
          };
        }),
        projects: projects.map((p) => ({ ...p, completedAt: toDateOnly(p.completedAt) })),
        certifications: certifications.map((c) => ({
          ...c,
          issueDate: toDateOnly(c.issueDate),
          expiryDate: toDateOnly(c.expiryDate),
        })),
        technologies: {
          explicit: explicitTech,
          viaProjects: projectTech.map((t) => ({
            id: t.technologyId,
            name: techName.get(t.technologyId) ?? "",
            projects: t._count._all,
          })),
        },
        experiences: experiences.map((x) => ({
          ...x,
          startDate: toDateOnly(x.startDate),
          endDate: toDateOnly(x.endDate),
        })),
      };
    },
  };
}

export type SkillDossierDto = Awaited<
  ReturnType<ReturnType<typeof createSkillIntelligenceService>["get"]>
>;
