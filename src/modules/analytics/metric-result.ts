import { getMetric } from "./metric-catalogue";
import type { PeriodDto } from "./period";

/**
 * The analytics result contract (ADR 0019). Data states are never conflated:
 *
 * - `ok`                — a value greater than zero
 * - `zero`              — the user has records of this kind, and the metric is genuinely 0
 * - `no_data`           — the user has no records of this kind at all (value is null)
 * - `insufficient_data` — records exist but lack what the metric needs (e.g. no dated evidence)
 * - `unavailable`       — the metric cannot be computed in this phase
 */
export type MetricState = "ok" | "zero" | "no_data" | "insufficient_data" | "unavailable";

export type Comparison =
  | { state: "available"; previousValue: number; period: PeriodDto }
  | { state: "unavailable"; reason: string }
  | { state: "not_applicable"; reason: string };

export interface DistributionBucket {
  key: string;
  label: string;
  value: number;
}

export interface MetricResult {
  key: string;
  name: string;
  value: number | null;
  state: MetricState;
  /** Explains a non-ok state in one sentence. */
  stateReason: string | null;
  temporal: "point_in_time" | "period";
  period: PeriodDto | null;
  comparison: Comparison | null;
  /** For distributions: every bucket, zeros included, in a stable order. */
  breakdown: DistributionBucket[] | null;
  /** Dashboard filters that narrowed this metric (labels). */
  filtersApplied: string[];
  source: string[];
}

interface Inputs {
  value: number;
  /** Does the user have any records of the metric's base entity (before filters)? */
  hasBaseRecords: boolean;
  /** Set when records exist but the metric's required attribute is missing. */
  insufficientReason?: string | null;
  period?: PeriodDto | null;
  comparison?: Comparison | null;
  breakdown?: DistributionBucket[] | null;
  filtersApplied?: string[];
  noDataReason: string;
}

export function deriveState(
  input: Pick<Inputs, "value" | "hasBaseRecords" | "insufficientReason">,
): MetricState {
  if (!input.hasBaseRecords) return "no_data";
  if (input.insufficientReason) return "insufficient_data";
  return input.value > 0 ? "ok" : "zero";
}

/** Build a result from a catalogue definition + computed inputs. */
export function metricResult(key: string, input: Inputs): MetricResult {
  const definition = getMetric(key);
  if (definition.availability.status !== "available") {
    throw new Error(`Metric ${key} is unavailable and must not be computed`);
  }
  const state = deriveState(input);
  const reason =
    state === "no_data"
      ? input.noDataReason
      : state === "insufficient_data"
        ? (input.insufficientReason ?? null)
        : null;
  return {
    key,
    name: definition.name,
    value: state === "no_data" || state === "insufficient_data" ? null : input.value,
    state,
    stateReason: reason,
    temporal: definition.temporal,
    period: definition.temporal === "period" ? (input.period ?? null) : null,
    comparison: definition.temporal === "period" ? (input.comparison ?? null) : null,
    breakdown: input.breakdown ?? null,
    filtersApplied: input.filtersApplied ?? [],
    source: definition.source,
  };
}

/**
 * A previous-period comparison is valid only for a bounded period AND when the user has records
 * dated before the current period starts. Otherwise a zero "previous" value would be fabricated.
 */
export function comparisonFor(input: {
  previous: { value: number; period: PeriodDto } | null;
  hasHistoryBeforePeriod: boolean;
  entityLabel: string;
}): Comparison {
  if (!input.previous) {
    return { state: "not_applicable", reason: "No comparison for an all-time period." };
  }
  if (!input.hasHistoryBeforePeriod) {
    return {
      state: "unavailable",
      reason: `Comparison unavailable: no ${input.entityLabel} is dated before this period.`,
    };
  }
  return { state: "available", previousValue: input.previous.value, period: input.previous.period };
}
