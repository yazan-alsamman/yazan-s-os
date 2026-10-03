import type { PrismaClient } from "@/generated/prisma/client";
import {
  analyseExperiments,
  matchesDerived,
  type AnalysedExperiment,
} from "@/modules/experiments/experiment-intelligence";
import {
  EXPERIMENT_STATUS_LABEL,
  EXPERIMENT_STATUSES,
  DECISION_LABEL,
  EXPERIMENT_DECISIONS,
  isOpenExperiment,
  REPRODUCIBILITY_LABEL,
} from "@/modules/experiments/experiment.rules";
import type { ListExperimentsQuery } from "@/modules/experiments/experiment.schemas";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";

import { metricResult } from "./metric-result";

/**
 * AI Lab analytics (Phase 6, ADR 0038/0040). Governed metrics are computed from one analysed
 * experiment set with the same predicate as GET /api/v1/experiments, so each count equals its
 * drill-down list total. Cost/latency/token summaries are descriptive run aggregates over
 * recorded values only — never fabricated, never shown as governed Command Center KPIs.
 */
type Query = Partial<ListExperimentsQuery>;

/** In-memory mirror of `experimentWhere` + `matchesDerived` for the metric predicates. */
export function matchesExperimentQuery(a: AnalysedExperiment, q: Query): boolean {
  const e = a.experiment;
  if (q.status && e.status !== q.status) return false;
  if (q.decision && e.decision !== q.decision) return false;
  if (q.category !== undefined && (e.category ?? null) !== q.category) return false;
  if (q.projectId && e.projectId !== q.projectId) return false;
  if (q.open !== undefined && isOpenExperiment(e.status) !== q.open) return false;
  if (q.hasRuns !== undefined && a.signals.runs.total > 0 !== q.hasRuns) return false;
  if (q.hasEvidence !== undefined && a.signals.evidence > 0 !== q.hasEvidence) return false;
  return matchesDerived(a, q);
}

const REPRO_STATES = ["reproducible", "partial", "not_reproducible", "unknown"] as const;

export function createExperimentsAnalyticsService(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return {
    async summary(ctx: ServiceContext) {
      const now = clock();
      const all = await analyseExperiments(db, ctx.userId);
      const count = (q: Query) => all.filter((a) => matchesExperimentQuery(a, q)).length;
      const has = all.length > 0;
      const none = "No experiments yet.";
      const m = (key: string, value: number) =>
        metricResult(key, { value, hasBaseRecords: has, noDataReason: none });

      // Categories actually present (plus a "none" bucket), like skills by-category.
      const categories = [
        ...new Set(all.map((a) => a.experiment.category).filter((c): c is string => !!c)),
      ].sort((x, y) => x.localeCompare(y));

      const decided = all.filter((a) => a.experiment.decision !== null).length;
      const adopted = count({ decision: "adopt" });
      const withRuns = count({ hasRuns: true });
      const evaluated = all.filter((a) => a.signals.evaluation.runsWithMetrics > 0).length;
      const runsTotal = all.reduce((s, a) => s + a.signals.runs.total, 0);

      // Experiments created per calendar month (UTC), oldest first.
      const monthly = new Map<string, number>();
      for (const a of all) {
        const key = a.experiment.createdAt.toISOString().slice(0, 7);
        monthly.set(key, (monthly.get(key) ?? 0) + 1);
      }
      const months = [...monthly.entries()].sort((x, y) => x[0].localeCompare(y[0]));

      // Descriptive run-measurement summary (recorded values only; null = not recorded, not zero).
      const measures = await db.$queryRaw<
        {
          cost_runs: number;
          cost_sum: number | null;
          cost_avg: number | null;
          latency_runs: number;
          latency_avg: number | null;
          token_runs: number;
          token_sum: number | null;
        }[]
      >`
        SELECT
          COUNT(*) FILTER (WHERE cost_usd IS NOT NULL)::int AS cost_runs,
          SUM(cost_usd) AS cost_sum,
          AVG(cost_usd) AS cost_avg,
          COUNT(*) FILTER (WHERE latency_ms IS NOT NULL)::int AS latency_runs,
          AVG(latency_ms) AS latency_avg,
          COUNT(*) FILTER (WHERE tokens_input IS NOT NULL OR tokens_output IS NOT NULL)::int AS token_runs,
          SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)) FILTER (WHERE tokens_input IS NOT NULL OR tokens_output IS NOT NULL) AS token_sum
        FROM experiment_runs WHERE user_id = ${ctx.userId}::uuid`;
      const ms = measures[0]!;

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(utcDay(now))!,
        recordCounts: { experiments: all.length, runs: runsTotal },

        total: m("ai.experiments", all.length),
        active: m("ai.active_experiments", count({ open: true })),
        completed: m("ai.completed_experiments", count({ status: "completed" })),
        abandoned: m("ai.abandoned_experiments", count({ status: "abandoned" })),
        runsTotal: m("ai.runs_total", runsTotal),

        status: metricResult("ai.experiments_by_status", {
          value: all.length,
          hasBaseRecords: has,
          noDataReason: none,
          breakdown: EXPERIMENT_STATUSES.map((s) => ({
            key: s,
            label: EXPERIMENT_STATUS_LABEL[s],
            value: count({ status: s }),
          })),
        }),
        decision: metricResult("ai.experiments_by_decision", {
          value: all.length,
          hasBaseRecords: has,
          noDataReason: none,
          breakdown: [
            ...EXPERIMENT_DECISIONS.map((d) => ({
              key: d,
              label: DECISION_LABEL[d],
              value: count({ decision: d }),
            })),
            { key: "undecided", label: "Undecided", value: all.length - decided },
          ],
        }),
        category: metricResult("ai.experiments_by_category", {
          value: all.length,
          hasBaseRecords: has,
          noDataReason: none,
          breakdown: [
            ...categories.map((c) => ({ key: c, label: c, value: count({ category: c }) })),
            {
              key: "__none",
              label: "Uncategorised",
              value: all.filter((a) => !a.experiment.category).length,
            },
          ],
        }),
        reproducibility: metricResult("ai.reproducibility_distribution", {
          value: all.length,
          hasBaseRecords: has,
          noDataReason: none,
          breakdown: REPRO_STATES.map((s) => ({
            key: s,
            label: REPRODUCIBILITY_LABEL[s],
            value: count({ reproducibility: s }),
          })),
        }),
        adoptionRate: metricResult("ai.adoption_rate", {
          value: decided ? adopted / decided : 0,
          hasBaseRecords: has,
          noDataReason: none,
          insufficientReason: decided ? null : "No experiment has a recorded decision yet.",
          breakdown: [
            { key: "adopt", label: "Adopted", value: adopted },
            { key: "other", label: "Other decision", value: decided - adopted },
          ],
        }),
        evaluationCoverage: metricResult("ai.evaluation_coverage", {
          value: withRuns ? evaluated / withRuns : 0,
          hasBaseRecords: has,
          noDataReason: none,
          insufficientReason: withRuns ? null : "No experiment has a recorded run yet.",
          breakdown: [
            { key: "evaluated", label: "With an evaluated run", value: evaluated },
            { key: "unevaluated", label: "Runs, no evaluation", value: withRuns - evaluated },
          ],
        }),
        missingEvaluation: m(
          "ai.experiments_missing_evaluation",
          all.filter((a) => a.signals.runs.total > 0 && a.signals.evaluation.runsWithMetrics === 0)
            .length,
        ),
        missingProvenance: m(
          "ai.experiments_missing_provenance",
          all.filter((a) => a.signals.evidence === 0).length,
        ),
        perMonth: metricResult("ai.experiments_per_month", {
          value: all.length,
          hasBaseRecords: has,
          noDataReason: none,
          breakdown: months.map(([key, value]) => ({ key, label: key, value })),
        }),

        // Descriptive only (not governed KPIs): recorded run measurements.
        measurements: {
          cost: {
            recordedRuns: ms.cost_runs,
            totalRuns: runsTotal,
            sumUsd: ms.cost_runs ? Number(ms.cost_sum) : null,
            avgUsd: ms.cost_runs ? Number(ms.cost_avg) : null,
          },
          latency: {
            recordedRuns: ms.latency_runs,
            totalRuns: runsTotal,
            avgMs: ms.latency_runs ? Number(ms.latency_avg) : null,
          },
          tokens: {
            recordedRuns: ms.token_runs,
            totalRuns: runsTotal,
            total: ms.token_runs ? Number(ms.token_sum) : null,
          },
        },
      };
    },
  };
}

export type ExperimentsAnalyticsDto = Awaited<
  ReturnType<ReturnType<typeof createExperimentsAnalyticsService>["summary"]>
>;
