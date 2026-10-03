import type {
  ExperimentDecision,
  ExperimentRunStatus,
  ExperimentStatus,
} from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors/app-error";
import { utcDay } from "@/modules/shared/calendar";

/**
 * AI Lab rules (Phase 6). Pure, deterministic and unit-tested. PEOS records experiments; it never
 * executes them, so every measurement is a user-recorded fact (ADR 0040). `today` is the UTC day.
 *
 *   experiment-lifecycle-v1   ADR 0037   explicit status transitions; completion ≠ success
 *   reproducibility-v1        ADR 0039   recorded-metadata completeness, not verified reproduction
 *   comparison-v1             ADR 0038   per-field / per-metric run diff, no overall winner
 */
export const EXPERIMENT_STATUSES = [
  "planned",
  "active",
  "completed",
  "abandoned",
] as const satisfies readonly ExperimentStatus[];

export const EXPERIMENT_DECISIONS = [
  "adopt",
  "reject",
  "inconclusive",
] as const satisfies readonly ExperimentDecision[];

export const RUN_STATUSES = [
  "completed",
  "failed",
  "aborted",
] as const satisfies readonly ExperimentRunStatus[];

export const MAX_EXPERIMENTS_PER_USER = 2_000;
export const MAX_RUNS_PER_EXPERIMENT = 500;
export const MAX_METRICS_PER_RUN = 100;

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
  abandoned: "Abandoned",
};
export const DECISION_LABEL: Record<ExperimentDecision, string> = {
  adopt: "Adopt",
  reject: "Reject",
  inconclusive: "Inconclusive",
};
export const RUN_STATUS_LABEL: Record<ExperimentRunStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  aborted: "Aborted",
};

/** Open = not yet finished (planned or active). */
export const isOpenExperiment = (status: ExperimentStatus) =>
  status === "planned" || status === "active";

// ── Lifecycle (experiment-lifecycle-v1) ──────────────────────────────────────

/** ADR 0037. Same-status updates are always allowed. Completion is never equated with success. */
export const EXPERIMENT_TRANSITIONS: Record<ExperimentStatus, readonly ExperimentStatus[]> = {
  planned: ["active", "abandoned"],
  active: ["completed", "abandoned"],
  completed: ["active"], // reopen
  abandoned: ["planned", "active"], // restore
};

export function assertTransition(from: ExperimentStatus, to: ExperimentStatus) {
  if (from === to || EXPERIMENT_TRANSITIONS[from].includes(to)) return;
  throw new AppError("VALIDATION_FAILED", {
    details: [
      {
        path: "status",
        message: `An experiment cannot move from ${from} to ${to}`,
      },
    ],
  });
}

/**
 * completed ⇔ completedAt. Completing defaults the date to today (UTC); future dates and a
 * completion date on a non-completed experiment are rejected; leaving "completed" clears it.
 */
export function resolveCompletion(
  input: { status: ExperimentStatus; completedAt: Date | null | undefined },
  now: Date,
): { status: ExperimentStatus; completedAt: Date | null } {
  const today = utcDay(now);
  if (input.status === "completed") {
    const completedAt = input.completedAt ?? today;
    if (completedAt.getTime() > today.getTime()) {
      throw new AppError("VALIDATION_FAILED", {
        details: [{ path: "completedAt", message: "A completion date cannot be in the future" }],
      });
    }
    return { status: "completed", completedAt };
  }
  if (input.completedAt) {
    throw new AppError("VALIDATION_FAILED", {
      details: [
        {
          path: "completedAt",
          message: "Only completed experiments have a completion date",
        },
      ],
    });
  }
  return { status: input.status, completedAt: null };
}

export function experimentTransitionVerb(
  before: ExperimentStatus,
  after: ExperimentStatus,
): "completed" | "reopened" | "abandoned" | "updated" {
  if (before !== "completed" && after === "completed") return "completed";
  if (before === "completed" && after !== "completed") return "reopened";
  if (before !== "abandoned" && after === "abandoned") return "abandoned";
  return "updated";
}

// ── Reproducibility (reproducibility-v1) ──────────────────────────────────────

export type ReproducibilityState = "reproducible" | "partial" | "not_reproducible" | "unknown";

/** The recorded-metadata fields a run needs to be reproducible (ADR 0039). */
export const REPRODUCIBILITY_FIELDS = [
  "model",
  "modelVersion",
  "promptVersion",
  "datasetName",
  "codeRef",
] as const;
export type ReproducibilityField = (typeof REPRODUCIBILITY_FIELDS)[number];

export interface RunReproducibility {
  model: "reproducibility-v1";
  state: Exclude<ReproducibilityState, "unknown">;
  present: ReproducibilityField[];
  missing: ReproducibilityField[];
  explanation: string;
}

/**
 * Classify ONE run by how completely its reproduction metadata is recorded. This measures the
 * record, not whether the run actually reproduces — the explanation says so.
 */
export function runReproducibility(
  run: Partial<Record<ReproducibilityField, string | null>>,
): RunReproducibility {
  const present = REPRODUCIBILITY_FIELDS.filter((f) => {
    const v = run[f];
    return typeof v === "string" && v.trim().length > 0;
  });
  const missing = REPRODUCIBILITY_FIELDS.filter((f) => !present.includes(f));
  const state =
    missing.length === 0 ? "reproducible" : present.length === 0 ? "not_reproducible" : "partial";
  const base = "Based on recorded metadata only — not a verified reproduction.";
  const explanation =
    state === "reproducible"
      ? `All reproduction metadata is recorded (${REPRODUCIBILITY_FIELDS.join(", ")}). ${base}`
      : state === "not_reproducible"
        ? `No reproduction metadata is recorded. ${base}`
        : `Recorded: ${present.join(", ") || "none"}; missing: ${missing.join(", ")}. ${base}`;
  return { model: "reproducibility-v1", state, present, missing, explanation };
}

/**
 * Experiment-level reproducibility: `unknown` with no runs, otherwise the best run (if any run is
 * fully specified the experiment can be reproduced from it). Never claims verified reproduction.
 */
export function experimentReproducibility(
  runs: readonly Partial<Record<ReproducibilityField, string | null>>[],
): { model: "reproducibility-v1"; state: ReproducibilityState; explanation: string } {
  if (runs.length === 0) {
    return {
      model: "reproducibility-v1",
      state: "unknown",
      explanation: "No runs are recorded yet, so reproducibility cannot be assessed.",
    };
  }
  const states = runs.map((r) => runReproducibility(r).state);
  const state: ReproducibilityState = states.includes("reproducible")
    ? "reproducible"
    : states.includes("partial")
      ? "partial"
      : "not_reproducible";
  const best =
    state === "not_reproducible"
      ? "No run records any reproduction metadata."
      : `At least one run is ${state === "reproducible" ? "fully" : "partially"} specified.`;
  return {
    model: "reproducibility-v1",
    state,
    explanation: `${best} Based on recorded metadata only — not a verified reproduction.`,
  };
}

export const REPRODUCIBILITY_LABEL: Record<ReproducibilityState, string> = {
  reproducible: "Reproducible (recorded)",
  partial: "Partially recorded",
  not_reproducible: "Not recorded",
  unknown: "Unknown",
};

// ── Comparison (comparison-v1) ────────────────────────────────────────────────

export interface RunMeasure {
  model: string | null;
  modelVersion: string | null;
  provider: string | null;
  promptVersion: string | null;
  datasetName: string | null;
  datasetVersion: string | null;
  codeRef: string | null;
  environment: string | null;
  costUsd: number | null;
  latencyMs: number | null;
  tokensInput: number | null;
  tokensOutput: number | null;
}

export interface MetricPoint {
  name: string;
  value: number;
  unit: string | null;
  higherIsBetter: boolean | null;
}

export interface FieldDiff {
  key: string;
  a: string | null;
  b: string | null;
  changed: boolean;
}

export interface NumericDiff {
  key: string;
  unit: string;
  lowerIsBetter: boolean;
  a: number | null;
  b: number | null;
  delta: number | null;
  /** improvement | regression | equal | incomparable (a value missing on either side) */
  verdict: "improvement" | "regression" | "equal" | "incomparable";
}

export interface MetricDiff {
  name: string;
  unit: string | null;
  higherIsBetter: boolean | null;
  a: number | null;
  b: number | null;
  delta: number | null;
  verdict: "improvement" | "regression" | "equal" | "incomparable" | "no_direction";
}

const CONFIG_KEYS: { key: keyof RunMeasure; label: string }[] = [
  { key: "model", label: "model" },
  { key: "modelVersion", label: "modelVersion" },
  { key: "provider", label: "provider" },
  { key: "promptVersion", label: "promptVersion" },
  { key: "datasetName", label: "datasetName" },
  { key: "datasetVersion", label: "datasetVersion" },
  { key: "codeRef", label: "codeRef" },
  { key: "environment", label: "environment" },
];

const MEASURE_KEYS: { key: keyof RunMeasure; label: string; unit: string }[] = [
  { key: "costUsd", label: "cost", unit: "USD" },
  { key: "latencyMs", label: "latency", unit: "ms" },
  { key: "tokensInput", label: "tokens in", unit: "tokens" },
  { key: "tokensOutput", label: "tokens out", unit: "tokens" },
];

function numericDiff(
  key: string,
  unit: string,
  lowerIsBetter: boolean,
  a: number | null,
  b: number | null,
): NumericDiff {
  if (a === null || b === null)
    return { key, unit, lowerIsBetter, a, b, delta: null, verdict: "incomparable" };
  const delta = b - a;
  const verdict =
    delta === 0 ? "equal" : delta < 0 === lowerIsBetter ? "improvement" : "regression";
  return { key, unit, lowerIsBetter, a, b, delta, verdict };
}

/**
 * Diff two runs (A = baseline, B = candidate). Config fields show what changed; cost/latency/token
 * measures and evaluation metrics show deltas with a per-field direction. There is no overall
 * winner — a missing value on either side is "incomparable", never treated as zero (ADR 0038).
 */
export function compareRuns(
  a: { measure: RunMeasure; metrics: MetricPoint[] },
  b: { measure: RunMeasure; metrics: MetricPoint[] },
): { config: FieldDiff[]; measures: NumericDiff[]; metrics: MetricDiff[] } {
  const config = CONFIG_KEYS.map(({ key, label }) => {
    const av = (a.measure[key] ?? null) as string | null;
    const bv = (b.measure[key] ?? null) as string | null;
    return { key: label, a: av, b: bv, changed: av !== bv };
  });
  const measures = MEASURE_KEYS.map(({ key, label, unit }) =>
    numericDiff(
      label,
      unit,
      true,
      a.measure[key] as number | null,
      b.measure[key] as number | null,
    ),
  );

  const names = [
    ...new Set([...a.metrics.map((m) => m.name), ...b.metrics.map((m) => m.name)]),
  ].sort((x, y) => x.localeCompare(y));
  const metrics: MetricDiff[] = names.map((name) => {
    const ma = a.metrics.find((m) => m.name === name) ?? null;
    const mb = b.metrics.find((m) => m.name === name) ?? null;
    const unit = ma?.unit ?? mb?.unit ?? null;
    const higherIsBetter = ma?.higherIsBetter ?? mb?.higherIsBetter ?? null;
    const av = ma?.value ?? null;
    const bv = mb?.value ?? null;
    if (av === null || bv === null)
      return { name, unit, higherIsBetter, a: av, b: bv, delta: null, verdict: "incomparable" };
    const delta = bv - av;
    const verdict =
      higherIsBetter === null
        ? "no_direction"
        : delta === 0
          ? "equal"
          : delta > 0 === higherIsBetter
            ? "improvement"
            : "regression";
    return { name, unit, higherIsBetter, a: av, b: bv, delta, verdict };
  });
  return { config, measures, metrics };
}
