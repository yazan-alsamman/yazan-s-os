# ADR 0045 — Architecture analytics, project coverage and drill-down

**Status:** Accepted · 2026-10-03 · Phase 7

## Context

- **`00` §4:** KPI "Architecture Decisions", Critical panel "Stale critical decision", chart
  "Architecture decision timeline". **`08`:** acceptance "projects can expose architecture as
  structured knowledge". ADR 0019/0020 require governed metrics with exact drill-downs.
- The prompt forbids opaque scores and equating "project has technology" with "project has
  architecture".

## Decision

1. **Source lists.** `GET /api/v1/architecture/decisions` (decision metrics),
   `GET /api/v1/architecture/components` (component metrics) and `GET /api/v1/projects`
   (coverage). Structural filters run in SQL (`decisionWhere`, `componentWhere`, the projects
   repository); derived filters (`revisitDue`, `staleCritical`, `incomplete`) run on the analysed
   set. The analytics service uses in-memory mirrors (`matchesDecisionQuery`,
   `matchesComponentQuery`) and the identical Prisma predicate for projects, so **every metric and
   bucket equals its drill-down list total** (integration-tested).
2. **Metrics (13):** `architecture.decisions` (now available, version 2),
   `decisions_in_force`, `decisions_by_status`, `revisit_due`, `stale_critical_decisions`,
   `decisions_without_evidence`, `decisions_with_gaps`, `decision_timeline` (per UTC month of
   `decidedAt`; proposals excluded), `project_coverage`, `components`, `components_by_type`,
   `critical_components`, `components_without_decisions`.
3. **Project coverage** = projects with ≥ 1 **explicitly linked decision** ÷ all projects. Using
   technologies, or having components, does not count. The numerator drills to the projects list
   filtered by the new optional `hasArchitecture` filter (an additive, backwards-compatible change
   to the Phase 1 projects API).
4. **Command Center:** the `architecture.decisions` KPI and the stale-critical items in the
   Critical/attention panel come from the same analytics service; no duplicate calculation.
5. **Not available:** the technology heatmap over time (needs dated usage, P3-7) and technical debt
   (Phase 9) stay unavailable.

## Consequences

The catalogue has 101 metrics, 93 available. Architecture analytics never claim coverage, quality
or staleness beyond what is recorded.
