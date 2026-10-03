import { Prisma, type AIExperiment, type PrismaClient } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  compareRuns,
  experimentReproducibility,
  runReproducibility,
  type ReproducibilityState,
} from "./experiment.rules";
import type { CompareQuery, ListExperimentsQuery } from "./experiment.schemas";
import { runSnapshot, toExperimentDto } from "./experiment.service";

export interface ExperimentSignals {
  runs: { total: number; byStatus: Record<string, number> };
  evaluation: { runsWithMetrics: number };
  measured: { cost: number; latency: number; tokens: number };
  evidence: number;
  reproducibility: ReproducibilityState;
  latest: {
    id: string;
    runNumber: number;
    status: string;
    model: string | null;
    costUsd: number | null;
    latencyMs: number | null;
    runAt: string | null;
  } | null;
}

export interface AnalysedExperiment {
  experiment: AIExperiment;
  signals: ExperimentSignals;
}

interface RunAggRow {
  experiment_id: string;
  total: number;
  repro_full: number;
  repro_any: number;
  with_metrics: number;
  cost_runs: number;
  latency_runs: number;
  token_runs: number;
  completed: number;
  failed: number;
  aborted: number;
}

const PRESENT = (c: string) =>
  Prisma.sql`(${Prisma.raw(c)} IS NOT NULL AND btrim(${Prisma.raw(c)}) <> '')`;

export async function analyseExperiments(
  db: PrismaClient,
  userId: string,
  where: Prisma.AIExperimentWhereInput = {},
): Promise<AnalysedExperiment[]> {
  const experiments = await db.aIExperiment.findMany({
    where: { ...where, userId },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  if (experiments.length === 0) return [];
  const ids = experiments.map((e) => e.id);
  const everyExperiment = Object.keys(where).length === 0;
  const scope = everyExperiment
    ? Prisma.empty
    : Prisma.sql`AND r.experiment_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;

  const [runAgg, latest, evidence] = await Promise.all([
    db.$queryRaw<RunAggRow[]>`
      SELECT r.experiment_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${PRESENT("r.model")} AND ${PRESENT("r.model_version")}
          AND ${PRESENT("r.prompt_version")} AND ${PRESENT("r.dataset_name")}
          AND ${PRESENT("r.code_ref")})::int AS repro_full,
        COUNT(*) FILTER (WHERE ${PRESENT("r.model")} OR ${PRESENT("r.model_version")}
          OR ${PRESENT("r.prompt_version")} OR ${PRESENT("r.dataset_name")}
          OR ${PRESENT("r.code_ref")})::int AS repro_any,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM experiment_metrics m WHERE m.run_id = r.id))::int AS with_metrics,
        COUNT(*) FILTER (WHERE r.cost_usd IS NOT NULL)::int AS cost_runs,
        COUNT(*) FILTER (WHERE r.latency_ms IS NOT NULL)::int AS latency_runs,
        COUNT(*) FILTER (WHERE r.tokens_input IS NOT NULL OR r.tokens_output IS NOT NULL)::int AS token_runs,
        COUNT(*) FILTER (WHERE r.status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE r.status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE r.status = 'aborted')::int AS aborted
      FROM experiment_runs r
      WHERE r.user_id = ${userId}::uuid ${scope}
      GROUP BY r.experiment_id`,
    db.$queryRaw<
      {
        experiment_id: string;
        id: string;
        run_number: number;
        status: string;
        model: string | null;
        cost_usd: number | null;
        latency_ms: number | null;
        run_at: Date | null;
      }[]
    >`
      SELECT DISTINCT ON (r.experiment_id)
        r.experiment_id, r.id, r.run_number, r.status, r.model, r.cost_usd, r.latency_ms, r.run_at
      FROM experiment_runs r
      WHERE r.user_id = ${userId}::uuid ${scope}
      ORDER BY r.experiment_id, r.run_number DESC`,
    db.experimentEvidence.groupBy({
      by: ["experimentId"],
      where: everyExperiment ? { userId } : { userId, experimentId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const runByExp = new Map(runAgg.map((r) => [r.experiment_id, r]));
  const latestByExp = new Map(latest.map((r) => [r.experiment_id, r]));
  const evidenceByExp = new Map(evidence.map((r) => [r.experimentId, r._count._all]));

  return experiments.map((experiment) => {
    const agg = runByExp.get(experiment.id);
    const total = agg?.total ?? 0;
    const reproducibility: ReproducibilityState =
      total === 0
        ? "unknown"
        : (agg?.repro_full ?? 0) > 0
          ? "reproducible"
          : (agg?.repro_any ?? 0) > 0
            ? "partial"
            : "not_reproducible";
    const l = latestByExp.get(experiment.id);
    const signals: ExperimentSignals = {
      runs: {
        total,
        byStatus: {
          completed: agg?.completed ?? 0,
          failed: agg?.failed ?? 0,
          aborted: agg?.aborted ?? 0,
        },
      },
      evaluation: { runsWithMetrics: agg?.with_metrics ?? 0 },
      measured: {
        cost: agg?.cost_runs ?? 0,
        latency: agg?.latency_runs ?? 0,
        tokens: agg?.token_runs ?? 0,
      },
      evidence: evidenceByExp.get(experiment.id) ?? 0,
      reproducibility,
      latest: l
        ? {
            id: l.id,
            runNumber: l.run_number,
            status: l.status,
            model: l.model,
            costUsd: l.cost_usd,
            latencyMs: l.latency_ms,
            runAt: toDateOnly(l.run_at),
          }
        : null,
    };
    return { experiment, signals };
  });
}

/** Compact row for lists and analytics. */
export function toExperimentRow(a: AnalysedExperiment) {
  return {
    ...toExperimentDto(a.experiment),
    runs: a.signals.runs,
    evaluation: a.signals.evaluation,
    measured: a.signals.measured,
    reproducibility: a.signals.reproducibility,
    evidenceCount: a.signals.evidence,
    latest: a.signals.latest,
  };
}
export type ExperimentRow = ReturnType<typeof toExperimentRow>;

/** Structural filters PostgreSQL evaluates (owner scope is always added). */
export function experimentWhere(q: Partial<ListExperimentsQuery>): Prisma.AIExperimentWhereInput {
  const and: Prisma.AIExperimentWhereInput[] = [];
  if (q.q) {
    const term = { contains: escapeLike(q.q), mode: "insensitive" as const };
    and.push({
      OR: [
        { title: term },
        { hypothesis: term },
        { objective: term },
        { result: term },
        { category: term },
      ],
    });
  }
  if (q.status) and.push({ status: q.status });
  if (q.decision) and.push({ decision: q.decision });
  if (q.category) and.push({ category: q.category });
  if (q.projectId) and.push({ projectId: q.projectId });
  if (q.open !== undefined)
    and.push({ status: q.open ? { in: ["planned", "active"] } : { notIn: ["planned", "active"] } });
  if (q.hasRuns !== undefined) and.push({ runs: q.hasRuns ? { some: {} } : { none: {} } });
  if (q.hasEvidence !== undefined)
    and.push({ evidence: q.hasEvidence ? { some: {} } : { none: {} } });
  if (q.createdFrom || q.createdTo)
    and.push({ createdAt: { gte: q.createdFrom, lte: q.createdTo } });
  return and.length ? { AND: and } : {};
}

/** Derived filters (same predicate for the list and the metrics — exact reconciliation). */
export function matchesDerived(a: AnalysedExperiment, q: Partial<ListExperimentsQuery>): boolean {
  if (q.hasEvaluation !== undefined && a.signals.evaluation.runsWithMetrics > 0 !== q.hasEvaluation)
    return false;
  if (q.reproducibility && a.signals.reproducibility !== q.reproducibility) return false;
  return true;
}

export function sortExperiments(rows: AnalysedExperiment[], sort: ListExperimentsQuery["sort"]) {
  const tie = (a: AnalysedExperiment, b: AnalysedExperiment) =>
    a.experiment.title.localeCompare(b.experiment.title) ||
    a.experiment.id.localeCompare(b.experiment.id);
  const cmp: Record<typeof sort, (a: AnalysedExperiment, b: AnalysedExperiment) => number> = {
    updatedAt: (a, b) =>
      b.experiment.updatedAt.getTime() - a.experiment.updatedAt.getTime() || tie(a, b),
    createdAt: (a, b) =>
      b.experiment.createdAt.getTime() - a.experiment.createdAt.getTime() || tie(a, b),
    title: tie,
    status: (a, b) => a.experiment.status.localeCompare(b.experiment.status) || tie(a, b),
    runs: (a, b) => b.signals.runs.total - a.signals.runs.total || tie(a, b),
  };
  return [...rows].sort(cmp[sort]);
}

export function createExperimentIntelligenceService(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return {
    /** GET /api/v1/experiments — structural filters in SQL, derived on the analysed set. */
    async list(ctx: ServiceContext, query: ListExperimentsQuery) {
      const analysed = (await analyseExperiments(db, ctx.userId, experimentWhere(query))).filter(
        (a) => matchesDerived(a, query),
      );
      const sorted = sortExperiments(analysed, query.sort);
      const start = (query.page - 1) * query.pageSize;
      return {
        data: sorted.slice(start, start + query.pageSize).map(toExperimentRow),
        page: {
          page: query.page,
          pageSize: query.pageSize,
          total: sorted.length,
          totalPages: Math.max(1, Math.ceil(sorted.length / query.pageSize)),
        },
        evaluatedOn: toDateOnly(utcDay(clock()))!,
      };
    },

    /** GET /api/v1/experiments/:id/intelligence — the dossier. */
    async get(ctx: ServiceContext, id: string) {
      const now = clock();
      const userId = ctx.userId;
      const [analysed] = await analyseExperiments(db, userId, { id });
      const a = requireFound(analysed);
      const [project, runs, evidence] = await Promise.all([
        a.experiment.projectId
          ? db.project.findFirst({
              where: { id: a.experiment.projectId, userId },
              select: { id: true, name: true, status: true },
            })
          : Promise.resolve(null),
        db.experimentRun.findMany({
          where: { userId, experimentId: id },
          orderBy: [{ runNumber: "asc" }],
          include: {
            metrics: { orderBy: [{ name: "asc" }, { createdAt: "asc" }] },
          },
        }),
        db.evidence.findMany({
          where: { userId, aiExperiments: { some: { experimentId: id } } },
          orderBy: [{ date: { sort: "desc", nulls: "last" } }, { title: "asc" }],
          select: { id: true, title: true, type: true, verified: true, date: true },
        }),
      ]);

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(utcDay(now))!,
        experiment: toExperimentDto(a.experiment),
        signals: a.signals,
        reproducibility: experimentReproducibility(runs),
        project,
        runs: runs.map((r) => ({
          ...runSnapshot(r),
          reproducibility: runReproducibility(r),
          metrics: r.metrics.map((m) => ({
            id: m.id,
            name: m.name,
            value: m.value,
            unit: m.unit,
            higherIsBetter: m.higherIsBetter,
            note: m.note,
          })),
        })),
        evidence: evidence.map((e) => ({ ...e, date: toDateOnly(e.date) })),
      };
    },

    /** GET /api/v1/experiments/:id/compare — diff two runs of the experiment (ADR 0038). */
    async compare(ctx: ServiceContext, experimentId: string, query: CompareQuery) {
      const userId = ctx.userId;
      await requireFound(
        await db.aIExperiment.findFirst({
          where: { id: experimentId, userId },
          select: { id: true },
        }),
      );
      const load = async (runId: string) =>
        requireFound(
          await db.experimentRun.findFirst({
            where: { id: runId, experimentId, userId },
            include: { metrics: true },
          }),
        );
      const [ra, rb] = await Promise.all([load(query.a), load(query.b)]);
      const toSide = (r: typeof ra) => ({
        measure: {
          model: r.model,
          modelVersion: r.modelVersion,
          provider: r.provider,
          promptVersion: r.promptVersion,
          datasetName: r.datasetName,
          datasetVersion: r.datasetVersion,
          codeRef: r.codeRef,
          environment: r.environment,
          costUsd: r.costUsd,
          latencyMs: r.latencyMs,
          tokensInput: r.tokensInput,
          tokensOutput: r.tokensOutput,
        },
        metrics: r.metrics.map((m) => ({
          name: m.name,
          value: m.value,
          unit: m.unit,
          higherIsBetter: m.higherIsBetter,
        })),
      });
      return {
        a: { id: ra.id, runNumber: ra.runNumber, label: ra.label },
        b: { id: rb.id, runNumber: rb.runNumber, label: rb.label },
        diff: compareRuns(toSide(ra), toSide(rb)),
      };
    },
  };
}

export type ExperimentDossierDto = Awaited<
  ReturnType<ReturnType<typeof createExperimentIntelligenceService>["get"]>
>;
export type ExperimentComparisonDto = Awaited<
  ReturnType<ReturnType<typeof createExperimentIntelligenceService>["compare"]>
>;
