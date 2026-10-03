import { describe, expect, it } from "vitest";

import { bucketHref, metricHref } from "@/components/command-center/drilldown";
import type { AIExperiment } from "@/generated/prisma/client";
import { matchesExperimentQuery } from "@/modules/analytics/experiments-analytics.service";

import {
  matchesDerived,
  sortExperiments,
  type AnalysedExperiment,
  type ExperimentSignals,
} from "./experiment-intelligence";
import type { ReproducibilityState } from "./experiment.rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function make(
  over: Partial<AIExperiment> & { id: string; title: string },
  sig: Partial<ExperimentSignals> & { reproducibility: ReproducibilityState },
): AnalysedExperiment {
  const experiment: AIExperiment = {
    userId: "u",
    projectId: null,
    hypothesis: null,
    objective: null,
    category: null,
    status: "active",
    decision: null,
    result: null,
    reproducibilityNote: null,
    startedAt: null,
    completedAt: null,
    createdAt: d("2026-01-01"),
    updatedAt: d("2026-01-01"),
    ...over,
  } as AIExperiment;
  const signals: ExperimentSignals = {
    runs: { total: 0, byStatus: { completed: 0, failed: 0, aborted: 0 } },
    evaluation: { runsWithMetrics: 0 },
    measured: { cost: 0, latency: 0, tokens: 0 },
    evidence: 0,
    latest: null,
    ...sig,
  };
  return { experiment, signals };
}

const a = make(
  {
    id: "a",
    title: "Alpha",
    status: "completed",
    decision: "adopt",
    category: "RAG",
    updatedAt: d("2026-03-01"),
  },
  {
    reproducibility: "reproducible",
    runs: { total: 3, byStatus: { completed: 3, failed: 0, aborted: 0 } },
    evaluation: { runsWithMetrics: 2 },
    evidence: 1,
  },
);
const b = make(
  { id: "b", title: "Beta", status: "active", category: "RAG", updatedAt: d("2026-05-01") },
  {
    reproducibility: "partial",
    runs: { total: 1, byStatus: { completed: 1, failed: 0, aborted: 0 } },
    evaluation: { runsWithMetrics: 0 },
  },
);
const c = make(
  { id: "c", title: "Gamma", status: "planned", updatedAt: d("2026-02-01") },
  { reproducibility: "unknown" },
);
const ALL = [a, b, c];

describe("experiment ordering is deterministic", () => {
  it("recently-updated default; stable across input order", () => {
    expect(sortExperiments(ALL, "updatedAt").map((x) => x.experiment.id)).toEqual(["b", "a", "c"]);
    expect(sortExperiments([...ALL].reverse(), "runs").map((x) => x.experiment.id)).toEqual(
      sortExperiments(ALL, "runs").map((x) => x.experiment.id),
    );
    expect(sortExperiments(ALL, "title").map((x) => x.experiment.id)).toEqual(["a", "b", "c"]);
  });
});

describe("list and metric predicates are the same function (ADR 0038)", () => {
  const ids = (q: Parameters<typeof matchesExperimentQuery>[1]) =>
    ALL.filter((x) => matchesExperimentQuery(x, q))
      .map((x) => x.experiment.id)
      .sort();

  it("structural and derived filters agree with the list", () => {
    expect(ids({ status: "completed" })).toEqual(["a"]);
    expect(ids({ open: true })).toEqual(["b", "c"]);
    expect(ids({ decision: "adopt" })).toEqual(["a"]);
    expect(ids({ category: "RAG" })).toEqual(["a", "b"]);
    expect(ids({ hasRuns: true })).toEqual(["a", "b"]);
    expect(ids({ hasEvaluation: true })).toEqual(["a"]);
    expect(ids({ hasRuns: true, hasEvaluation: false })).toEqual(["b"]);
    expect(ids({ hasEvidence: false })).toEqual(["b", "c"]);
    expect(ids({ reproducibility: "unknown" })).toEqual(["c"]);
    expect(matchesDerived(a, { reproducibility: "reproducible", hasEvaluation: true })).toBe(true);
  });
});

describe("AI Lab drill-downs", () => {
  const none = { from: null, to: null };
  it("single metrics open the experiments list with the metric's predicate", () => {
    expect(metricHref("ai.experiments", {}, none)).toBe("/ai-lab");
    expect(metricHref("ai.active_experiments", {}, none)).toBe("/ai-lab?open=true");
    expect(metricHref("ai.adoption_rate", {}, none)).toBe("/ai-lab?decision=adopt");
    expect(metricHref("ai.evaluation_coverage", {}, none)).toBe("/ai-lab?hasEvaluation=true");
    expect(metricHref("ai.experiments_missing_evaluation", {}, none)).toBe(
      "/ai-lab?hasRuns=true&hasEvaluation=false",
    );
    expect(metricHref("ai.experiments_missing_provenance", {}, none)).toBe(
      "/ai-lab?hasEvidence=false",
    );
  });

  it("distribution buckets map (undecided/uncategorised and bad months have no list)", () => {
    expect(bucketHref("ai.experiments_by_status", "completed", {})).toBe(
      "/ai-lab?status=completed",
    );
    expect(bucketHref("ai.experiments_by_decision", "adopt", {})).toBe("/ai-lab?decision=adopt");
    expect(bucketHref("ai.experiments_by_decision", "undecided", {})).toBeNull();
    expect(bucketHref("ai.experiments_by_category", "__none", {})).toBeNull();
    expect(bucketHref("ai.reproducibility_distribution", "partial", {})).toBe(
      "/ai-lab?reproducibility=partial",
    );
    expect(bucketHref("ai.experiments_per_month", "2026-05", {})).toBe(
      "/ai-lab?createdFrom=2026-05-01&createdTo=2026-05-31",
    );
    expect(bucketHref("ai.experiments_per_month", "nope", {})).toBeNull();
  });
});
