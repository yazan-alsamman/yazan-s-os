import type {
  ArchitectureComponent,
  ArchitectureDecision,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  documentationGaps,
  isRevisitDue,
  isStaleCritical,
  revisitExplanation,
  type DocumentationPart,
} from "./architecture.rules";
import type { ListComponentsQuery, ListDecisionsQuery, MapQuery } from "./architecture.schemas";
import { toComponentDto } from "./component.service";
import { toDecisionDto } from "./decision.service";

// ── Decisions ──────────────────────────────────────────────────────────────

export interface DecisionSignals {
  projects: number;
  evidence: number;
  alternatives: number;
  components: number;
  criticalComponents: number;
}

export interface AnalysedDecision {
  decision: ArchitectureDecision;
  signals: DecisionSignals;
  revisitDue: boolean;
  staleCritical: boolean;
  gaps: DocumentationPart[];
}

const countMap = (rows: { decisionId: string; _count: { _all: number } }[]) =>
  new Map(rows.map((r) => [r.decisionId, r._count._all]));

/** One decision query + five grouped counts for any number of decisions (no N+1). */
export async function analyseDecisions(
  db: PrismaClient,
  userId: string,
  now: Date,
  where: Prisma.ArchitectureDecisionWhereInput = {},
): Promise<AnalysedDecision[]> {
  const decisions = await db.architectureDecision.findMany({
    where: { ...where, userId },
    orderBy: [{ decidedAt: { sort: "desc", nulls: "last" } }, { title: "asc" }, { id: "asc" }],
  });
  if (decisions.length === 0) return [];
  const every = Object.keys(where).length === 0;
  const scope = every ? { userId } : { userId, decisionId: { in: decisions.map((d) => d.id) } };
  const [projects, evidence, alternatives, components, critical] = await Promise.all([
    db.decisionProject.groupBy({ by: ["decisionId"], where: scope, _count: { _all: true } }),
    db.architectureDecisionEvidence.groupBy({
      by: ["decisionId"],
      where: scope,
      _count: { _all: true },
    }),
    db.architectureAlternative.groupBy({
      by: ["decisionId"],
      where: scope,
      _count: { _all: true },
    }),
    db.decisionComponent.groupBy({ by: ["decisionId"], where: scope, _count: { _all: true } }),
    db.decisionComponent.groupBy({
      by: ["decisionId"],
      where: { ...scope, component: { critical: true } },
      _count: { _all: true },
    }),
  ]);
  const [p, e, a, c, k] = [projects, evidence, alternatives, components, critical].map(countMap);
  return decisions.map((decision) => {
    const signals: DecisionSignals = {
      projects: p!.get(decision.id) ?? 0,
      evidence: e!.get(decision.id) ?? 0,
      alternatives: a!.get(decision.id) ?? 0,
      components: c!.get(decision.id) ?? 0,
      criticalComponents: k!.get(decision.id) ?? 0,
    };
    return {
      decision,
      signals,
      revisitDue: isRevisitDue(decision, now),
      staleCritical: isStaleCritical(decision, signals.criticalComponents, now),
      gaps: documentationGaps({ ...decision, ...signals }),
    };
  });
}

export function toDecisionRow(a: AnalysedDecision) {
  return {
    ...toDecisionDto(a.decision),
    counts: a.signals,
    revisitDue: a.revisitDue,
    staleCritical: a.staleCritical,
    gaps: a.gaps,
  };
}
export type DecisionRow = ReturnType<typeof toDecisionRow>;

/** Structural filters PostgreSQL evaluates (owner scope is always added). */
export function decisionWhere(
  q: Partial<ListDecisionsQuery>,
): Prisma.ArchitectureDecisionWhereInput {
  const and: Prisma.ArchitectureDecisionWhereInput[] = [];
  if (q.q) {
    const term = { contains: escapeLike(q.q), mode: "insensitive" as const };
    and.push({
      OR: [
        { title: term },
        { context: term },
        { problem: term },
        { constraints: term },
        { decision: term },
        { consequences: term },
      ],
    });
  }
  if (q.status) and.push({ status: q.status });
  if (q.inForce !== undefined) and.push({ status: q.inForce ? "accepted" : { not: "accepted" } });
  if (q.projectId) and.push({ projects: { some: { projectId: q.projectId } } });
  if (q.componentId) and.push({ components: { some: { componentId: q.componentId } } });
  if (q.hasProjects !== undefined)
    and.push({ projects: q.hasProjects ? { some: {} } : { none: {} } });
  if (q.hasEvidence !== undefined)
    and.push({ evidence: q.hasEvidence ? { some: {} } : { none: {} } });
  if (q.hasAlternatives !== undefined)
    and.push({ alternatives: q.hasAlternatives ? { some: {} } : { none: {} } });
  if (q.decidedFrom || q.decidedTo)
    and.push({ decidedAt: { gte: q.decidedFrom, lte: q.decidedTo } });
  return and.length ? { AND: and } : {};
}

/** Derived filters (same predicate for the list and the metrics — exact reconciliation). */
export function matchesDecisionDerived(a: AnalysedDecision, q: Partial<ListDecisionsQuery>) {
  if (q.revisitDue !== undefined && a.revisitDue !== q.revisitDue) return false;
  if (q.staleCritical !== undefined && a.staleCritical !== q.staleCritical) return false;
  if (q.incomplete !== undefined && a.gaps.length > 0 !== q.incomplete) return false;
  return true;
}

export function sortDecisions(rows: AnalysedDecision[], sort: ListDecisionsQuery["sort"]) {
  const t = (d: Date | null) => (d ? d.getTime() : Number.NEGATIVE_INFINITY);
  const tie = (a: AnalysedDecision, b: AnalysedDecision) =>
    a.decision.title.localeCompare(b.decision.title) || a.decision.id.localeCompare(b.decision.id);
  const cmp: Record<typeof sort, (a: AnalysedDecision, b: AnalysedDecision) => number> = {
    decidedAt: (a, b) => t(b.decision.decidedAt) - t(a.decision.decidedAt) || tie(a, b),
    title: tie,
    status: (a, b) => a.decision.status.localeCompare(b.decision.status) || tie(a, b),
    updatedAt: (a, b) =>
      b.decision.updatedAt.getTime() - a.decision.updatedAt.getTime() || tie(a, b),
    revisitDate: (a, b) => {
      const x = a.decision.revisitDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const y = b.decision.revisitDate?.getTime() ?? Number.POSITIVE_INFINITY;
      return x - y || tie(a, b);
    },
  };
  return [...rows].sort(cmp[sort]);
}

// ── Components ─────────────────────────────────────────────────────────────

export interface ComponentSignals {
  projects: number;
  technologies: number;
  dependsOn: number;
  dependents: number;
  decisions: number;
  decisionsInForce: number;
}

export interface AnalysedComponent {
  component: ArchitectureComponent;
  signals: ComponentSignals;
}

export async function analyseComponents(
  db: PrismaClient,
  userId: string,
  where: Prisma.ArchitectureComponentWhereInput = {},
): Promise<AnalysedComponent[]> {
  const components = await db.architectureComponent.findMany({
    where: { ...where, userId },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  if (components.length === 0) return [];
  const every = Object.keys(where).length === 0;
  const ids = components.map((c) => c.id);
  const scope = every ? { userId } : { userId, componentId: { in: ids } };
  const [projects, technologies, dependsOn, dependents, decisions, inForce] = await Promise.all([
    db.componentProject.groupBy({ by: ["componentId"], where: scope, _count: { _all: true } }),
    db.componentTechnology.groupBy({ by: ["componentId"], where: scope, _count: { _all: true } }),
    db.componentDependency.groupBy({ by: ["componentId"], where: scope, _count: { _all: true } }),
    db.componentDependency.groupBy({
      by: ["dependsOnComponentId"],
      where: every ? { userId } : { userId, dependsOnComponentId: { in: ids } },
      _count: { _all: true },
    }),
    db.decisionComponent.groupBy({ by: ["componentId"], where: scope, _count: { _all: true } }),
    db.decisionComponent.groupBy({
      by: ["componentId"],
      where: { ...scope, decision: { status: "accepted" } },
      _count: { _all: true },
    }),
  ]);
  const m = (rows: { componentId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.componentId, r._count._all]));
  const [p, t, d, dec, inf] = [projects, technologies, dependsOn, decisions, inForce].map(m);
  const dep = new Map(dependents.map((r) => [r.dependsOnComponentId, r._count._all]));
  return components.map((component) => ({
    component,
    signals: {
      projects: p!.get(component.id) ?? 0,
      technologies: t!.get(component.id) ?? 0,
      dependsOn: d!.get(component.id) ?? 0,
      dependents: dep.get(component.id) ?? 0,
      decisions: dec!.get(component.id) ?? 0,
      decisionsInForce: inf!.get(component.id) ?? 0,
    },
  }));
}

export function toComponentRow(a: AnalysedComponent) {
  return { ...toComponentDto(a.component), counts: a.signals };
}
export type ComponentRow = ReturnType<typeof toComponentRow>;

export function componentWhere(
  q: Partial<ListComponentsQuery>,
): Prisma.ArchitectureComponentWhereInput {
  const and: Prisma.ArchitectureComponentWhereInput[] = [];
  if (q.q) {
    const term = { contains: escapeLike(q.q), mode: "insensitive" as const };
    and.push({ OR: [{ name: term }, { purpose: term }] });
  }
  if (q.type) and.push({ type: q.type });
  if (q.critical !== undefined) and.push({ critical: q.critical });
  if (q.projectId) and.push({ projects: { some: { projectId: q.projectId } } });
  if (q.technologyId) and.push({ technologies: { some: { technologyId: q.technologyId } } });
  if (q.hasDecisions !== undefined)
    and.push({ decisions: q.hasDecisions ? { some: {} } : { none: {} } });
  if (q.hasDependencies !== undefined)
    and.push(
      q.hasDependencies
        ? { OR: [{ dependsOn: { some: {} } }, { dependents: { some: {} } }] }
        : { dependsOn: { none: {} }, dependents: { none: {} } },
    );
  return and.length ? { AND: and } : {};
}

export function sortComponents(rows: AnalysedComponent[], sort: ListComponentsQuery["sort"]) {
  const tie = (a: AnalysedComponent, b: AnalysedComponent) =>
    a.component.name.localeCompare(b.component.name) ||
    a.component.id.localeCompare(b.component.id);
  const cmp: Record<typeof sort, (a: AnalysedComponent, b: AnalysedComponent) => number> = {
    name: tie,
    type: (a, b) => a.component.type.localeCompare(b.component.type) || tie(a, b),
    updatedAt: (a, b) =>
      b.component.updatedAt.getTime() - a.component.updatedAt.getTime() || tie(a, b),
  };
  return [...rows].sort(cmp[sort]);
}

// ── Service ────────────────────────────────────────────────────────────────

const page = <T>(rows: T[], q: { page: number; pageSize: number }) => {
  const start = (q.page - 1) * q.pageSize;
  return {
    data: rows.slice(start, start + q.pageSize),
    page: {
      page: q.page,
      pageSize: q.pageSize,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / q.pageSize)),
    },
  };
};

const STATUS_KEYS = ["status", "decidedAt", "supersededById"] as const;
function snapshotStatus(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const out: Record<string, string | null> = {};
  for (const k of STATUS_KEYS) out[k] = typeof r[k] === "string" ? (r[k] as string) : null;
  return out;
}

export function createArchitectureIntelligenceService(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return {
    async listDecisions(ctx: ServiceContext, q: ListDecisionsQuery) {
      const now = clock();
      const rows = (await analyseDecisions(db, ctx.userId, now, decisionWhere(q))).filter((a) =>
        matchesDecisionDerived(a, q),
      );
      const p = page(sortDecisions(rows, q.sort), q);
      return {
        data: p.data.map(toDecisionRow),
        page: p.page,
        evaluatedOn: toDateOnly(utcDay(now))!,
      };
    },

    /** GET /api/v1/architecture/decisions/:id/intelligence — the decision dossier. */
    async getDecision(ctx: ServiceContext, id: string) {
      const now = clock();
      const userId = ctx.userId;
      const [analysed] = await analyseDecisions(db, userId, now, { id });
      const a = requireFound(analysed);
      const [projects, evidence, alternatives, components, supersededBy, supersedes, audit] =
        await Promise.all([
          db.project.findMany({
            where: { userId, architectureDecisions: { some: { decisionId: id } } },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: { id: true, name: true, status: true },
          }),
          db.evidence.findMany({
            where: { userId, architectureDecisions: { some: { decisionId: id } } },
            orderBy: [{ date: { sort: "desc", nulls: "last" } }, { title: "asc" }],
            select: { id: true, title: true, type: true, verified: true, date: true },
          }),
          db.architectureAlternative.findMany({
            where: { userId, decisionId: id },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, name: true, pros: true, cons: true, rejectedReason: true },
          }),
          db.architectureComponent.findMany({
            where: { userId, decisions: { some: { decisionId: id } } },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: { id: true, name: true, type: true, critical: true },
          }),
          a.decision.supersededById
            ? db.architectureDecision.findFirst({
                where: { id: a.decision.supersededById, userId },
                select: { id: true, title: true, status: true, decidedAt: true },
              })
            : Promise.resolve(null),
          db.architectureDecision.findMany({
            where: { userId, supersededById: id },
            orderBy: [{ decidedAt: { sort: "asc", nulls: "last" } }, { title: "asc" }],
            select: { id: true, title: true, status: true, decidedAt: true },
          }),
          // Decision history from the audit log (real, dated events only; bounded).
          db.auditLog.findMany({
            where: { actorId: userId, entityType: "architecture_decision", entityId: id },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 100,
            select: { id: true, action: true, createdAt: true, before: true, after: true },
          }),
        ]);
      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(utcDay(now))!,
        decision: toDecisionDto(a.decision),
        counts: a.signals,
        revisitDue: a.revisitDue,
        staleCritical: a.staleCritical,
        revisit: revisitExplanation(a.decision, a.signals.criticalComponents, now),
        gaps: a.gaps,
        projects,
        evidence: evidence.map((e) => ({ ...e, date: toDateOnly(e.date) })),
        alternatives,
        components,
        supersededBy: supersededBy
          ? { ...supersededBy, decidedAt: toDateOnly(supersededBy.decidedAt) }
          : null,
        supersedes: supersedes.map((s) => ({ ...s, decidedAt: toDateOnly(s.decidedAt) })),
        history: audit.map((h) => ({
          id: h.id,
          at: h.createdAt.toISOString(),
          action: h.action.replace(/^architecture_decision\./, ""),
          from: snapshotStatus(h.before),
          to: snapshotStatus(h.after),
        })),
      };
    },

    async listComponents(ctx: ServiceContext, q: ListComponentsQuery) {
      const rows = await analyseComponents(db, ctx.userId, componentWhere(q));
      const p = page(sortComponents(rows, q.sort), q);
      return { data: p.data.map(toComponentRow), page: p.page };
    },

    /** GET /api/v1/architecture/components/:id/intelligence — the map node detail (01 §5). */
    async getComponent(ctx: ServiceContext, id: string) {
      const userId = ctx.userId;
      const [analysed] = await analyseComponents(db, userId, { id });
      const a = requireFound(analysed);
      const [projects, technologies, dependsOn, dependents, decisions] = await Promise.all([
        db.project.findMany({
          where: { userId, components: { some: { componentId: id } } },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: { id: true, name: true, status: true },
        }),
        db.technology.findMany({
          where: { userId, components: { some: { componentId: id } } },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: { id: true, name: true, version: true },
        }),
        db.architectureComponent.findMany({
          where: { userId, dependents: { some: { componentId: id } } },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: { id: true, name: true, type: true, critical: true },
        }),
        db.architectureComponent.findMany({
          where: { userId, dependsOn: { some: { dependsOnComponentId: id } } },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: { id: true, name: true, type: true, critical: true },
        }),
        db.architectureDecision.findMany({
          where: { userId, components: { some: { componentId: id } } },
          orderBy: [{ decidedAt: { sort: "desc", nulls: "last" } }, { title: "asc" }],
          select: { id: true, title: true, status: true, decidedAt: true },
        }),
      ]);
      return {
        component: toComponentDto(a.component),
        counts: a.signals,
        projects,
        technologies,
        dependsOn,
        dependents,
        decisions: decisions.map((d) => ({ ...d, decidedAt: toDateOnly(d.decidedAt) })),
      };
    },

    /**
     * GET /api/v1/architecture/map — the architecture map from persisted components and dependency
     * records only. Bounded: at most `limit` nodes (critical first, then by name — deterministic),
     * edges only between included nodes.
     */
    async map(ctx: ServiceContext, q: MapQuery) {
      const userId = ctx.userId;
      const where: Prisma.ArchitectureComponentWhereInput = {
        userId,
        ...(q.type ? { type: q.type } : {}),
        ...(q.projectId ? { projects: { some: { projectId: q.projectId } } } : {}),
      };
      const [total, nodes] = await Promise.all([
        db.architectureComponent.count({ where }),
        db.architectureComponent.findMany({
          where,
          orderBy: [{ critical: "desc" }, { name: "asc" }, { id: "asc" }],
          take: q.limit,
          select: {
            id: true,
            name: true,
            type: true,
            critical: true,
          },
        }),
      ]);
      const ids = nodes.map((n) => n.id);
      // Edges and decision counts scoped to the included nodes. A per-row relation _count here
      // regressed to ~650 ms under stale planner statistics (report §15); grouped counts do not.
      const [edges, decisionCounts] = ids.length
        ? await Promise.all([
            db.componentDependency.findMany({
              where: { userId, componentId: { in: ids }, dependsOnComponentId: { in: ids } },
              orderBy: [{ componentId: "asc" }, { dependsOnComponentId: "asc" }],
              select: { componentId: true, dependsOnComponentId: true },
            }),
            db.decisionComponent.groupBy({
              by: ["componentId"],
              where: { userId, componentId: { in: ids } },
              _count: { _all: true },
            }),
          ])
        : [[], []];
      const decisionsOf = new Map(decisionCounts.map((r) => [r.componentId, r._count._all]));
      return {
        nodes: nodes.map((n) => ({
          id: n.id,
          name: n.name,
          type: n.type,
          critical: n.critical,
          decisions: decisionsOf.get(n.id) ?? 0,
        })),
        edges: edges.map((e) => ({ from: e.componentId, to: e.dependsOnComponentId })),
        total,
        truncated: total > nodes.length,
        limit: q.limit,
      };
    },
  };
}

export type DecisionDossierDto = Awaited<
  ReturnType<ReturnType<typeof createArchitectureIntelligenceService>["getDecision"]>
>;
export type ComponentDossierDto = Awaited<
  ReturnType<ReturnType<typeof createArchitectureIntelligenceService>["getComponent"]>
>;
export type ArchitectureMapDto = Awaited<
  ReturnType<ReturnType<typeof createArchitectureIntelligenceService>["map"]>
>;
