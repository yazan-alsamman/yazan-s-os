# ADR 0038 — Evaluation, comparison, analytics and provenance (`comparison-v1`)

**Status:** Accepted · 2026-10-03 · Phase 6

## Context

- `01` §4 lists evaluation criteria (accuracy, precision/recall, groundedness, citation quality,
  hallucination rate, latency, tokens, cost, human evaluation) and says "metrics are extensible
  and domain-specific", and compares runs by "metric deltas, cost deltas, latency deltas".
- `05` AI Metrics lists experiments per month, successful experiment rate, average latency/cost,
  evaluation score, regression count, reproducibility rate; plus the AI Experiment Scatter.
- The prompt forbids an opaque "AI score" and a single ranking, and requires drill-down and
  missing-data states.

## Decision

1. **Evaluation is per-criterion** (`ExperimentMetric`: `name`, `value`, `unit`, `higherIsBetter`
   nullable, `note`), attached to a **run**. There is **no composite "AI score"** and no global
   "evaluation score" metric: units and directions differ, so a single number would hide
   interpretation. `higherIsBetter = null` means the metric is informational (no direction).
2. **Comparison (`comparison-v1`)** diffs two runs of one experiment: config fields (changed or
   not), the cost/latency/token measures (lower-is-better deltas), and the union of metric names
   (per-metric delta judged by that metric's own direction). **No overall winner is declared**; a
   value missing on either side is `incomparable`, never treated as zero.
3. **Governed metrics** (metric catalogue, ADR 0019) — all reconciled to the experiments list via
   one predicate (`matchesExperimentQuery` mirrors `experimentWhere` + `matchesDerived`), so each
   count equals its drill-down total (integration-tested):
   `ai.experiments`, `ai.active_experiments`, `ai.completed_experiments`,
   `ai.abandoned_experiments`, `ai.runs_total`, `ai.experiments_by_status`,
   `ai.experiments_by_decision`, `ai.experiments_by_category`, `ai.reproducibility_distribution`,
   `ai.adoption_rate`, `ai.evaluation_coverage`, `ai.experiments_missing_evaluation`,
   `ai.experiments_missing_provenance`, `ai.experiments_per_month`.
   - **Adoption rate** (05 "successful experiment rate") = decision=adopt ÷ decided; undecided
     excluded; empty → insufficient data. It is the owner's decision rate, not a measured success.
   - **Evaluation coverage** = experiments with an evaluated run ÷ experiments with any run.
4. **Cost / latency / tokens** are shown as **descriptive run summaries** (sum/avg over runs that
   recorded a value, with "N of M runs"), not governed Command-Center KPIs and not reconciled
   counts, because they are run-level aggregates with units. Runs without a value are excluded —
   never counted as zero. (This is why they are not catalogue metrics; `05`'s "average cost/
   latency" appear here as descriptive figures.)
5. **AI Experiment Scatter (`05`)** is **deferred**: its Y axis is "quality", which has no single
   defensible definition across experiments. A cost-vs-chosen-criterion scatter can be added later
   without inventing a composite (noted in the report's deferred list).
6. **Provenance.** Experiments link to the existing **Evidence** domain (`ExperimentEvidence`);
   `ai.experiments_missing_provenance` surfaces experiments with no evidence. Evidence is never
   inferred; the UI states when it is missing.

## Consequences

Every AI Lab number is defined and drills to the records behind it, or is explicitly descriptive.
No subjective judgement hides behind a numeric score.
