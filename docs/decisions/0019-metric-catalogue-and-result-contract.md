# ADR 0019 — Metric catalogue in code and the metric result contract

**Status:** Accepted · 2026-10-02 · Phase 2 · Resolves specification gap C7

## Context

`05` "Metric Governance" requires every metric to have a name, definition, formula, source,
frequency, owner and caveats. `00` §4 lists Command Center KPIs, but most have none of these
(gap C7). The product principle is "no fake numbers". Phase 2 has to show KPIs without inventing
any, and has to be honest about the KPIs it can't compute yet.

## Decision

1. **Catalogue in code.** `src/modules/analytics/metric-catalogue.ts` holds every metric. It sits
   next to the calculators and is validated by a strict Zod schema at module load, so a malformed
   definition fails the build and the tests. Each metric is versioned (`version`, `introduced`,
   `revised`). The catalogue is served read-only at `GET /api/v1/analytics/metrics`.
2. **Unavailable metrics are listed, not hidden.** The `00` §4 KPIs that need later phases appear
   as `unavailable` with a reason and the phase that unlocks them. A unit test checks that every
   `00` §4 KPI is in the catalogue, and `metricResult()` throws if code tries to compute an
   unavailable metric.
3. **One result contract, `MetricResult`.** It carries the value, a state, the reason for that
   state, whether the value is point-in-time or for a period, the period, a comparison, the
   breakdown, the filters applied and the source. The states are never conflated:
   - `ok` — the value is greater than 0.
   - `zero` — the user has records of this kind, and the true value is 0.
   - `no_data` — the user has no records of this kind. The value is `null`, and the UI shows "—"
     plus the reason, never `0`.
   - `insufficient_data` — records exist but lack the field the metric needs, such as evidence
     without dates. The value is `null`.
   - `unavailable` — catalogue only; never computed.
4. **Comparisons are never fabricated.** A previous-period value is shown only if the period is
   bounded **and** the user has records dated before it starts. Otherwise the comparison is
   `unavailable` (with the reason) or `not_applicable` (all time). Comparisons show the previous
   value as text. There are no arrows, no "good/bad" colours and no percentages: a change in a
   count has no direction the spec defines as better.
5. **Point-in-time vs period.** Current-state metrics (active projects, health and so on) ignore
   the date range and say so. Period metrics state their exact UTC day bounds.
6. **No caching or pre-aggregation in Phase 2.** Values are computed live with indexed
   `count`/`groupBy` queries, plus one parameterised `$queryRaw` for the monthly series. The
   response shows `calculatedAt`.

## Alternatives considered

- **Catalogue in the database.** That would allow editing at runtime, but formulas would drift
  from the code that implements them. Nothing needs runtime editing yet.
- **Return 0 for "no data".** Rejected: it fabricates a measurement.
- **Percent-change deltas.** Rejected: they mislead with small numbers, and the spec defines no
  baseline.

## Consequences

Adding a metric means adding a catalogue entry, a calculator, a drill-down mapping and tests. The
catalogue documentation (`docs/architecture/metric-catalogue.md`) is generated from this file.
