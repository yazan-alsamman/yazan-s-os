# ADR 0034 — Goal analytics, completion rate and drill-down reconciliation

**Status:** Accepted · 2026-10-03 · Phase 5

## Context

- **`05` Goal Metrics:** on-track goals, at-risk goals, overdue goals, completion rate, target
  attainment, Goal Burndown.
- **`00` §4** lists "Active Goals" in the Command Center KPI strip; Phase 2 catalogued
  `goals.active` as unavailable until Phase 5 (ADR 0019).
- ADR 0020 requires every KPI to drill down to the list that produced it.

## Decision

1. **Single source list.** `GET /api/v1/goals` is the drill-down target for every goal metric.
   Structural filters run in SQL (`goalWhere`); derived filters (`overdue`, `risk`,
   `attainment`, `skillGap`) run on the analysed rows (`matchesDerived`). The analytics service
   evaluates each metric with `matchesGoalQuery`, which mirrors `goalWhere` and calls the same
   `matchesDerived`. Integration tests assert metric value = list total for **every** goal metric
   and distribution bucket, and the Command Center KPI = the goal analytics value.
2. **Populations.**
   - `total`, `status_distribution`: every goal.
   - `active`: status active.
   - `overdue`, `at_risk`, `on_track`, `risk_distribution`, `deadline_load`, coverage gaps
     (`without_deadline`, `without_projects`, `without_skills`, `with_skill_gaps`): **open** goals.
   - `target_attainment`, `attainment_distribution`: **committed** goals (open or completed) —
     drafts and cancelled goals are not commitments. Drill-downs add `committed=true`.
3. **Completion rate** = completed ÷ (completed + overdue), mirroring the Phase 3 delivery rate
   (ADR 0024): goals that are done or past due. Without any completed or overdue goal the state
   is `insufficient_data`, never 0 %. The breakdown carries numerator and denominator; the
   numerator drills to `status=completed`.
4. **Target attainment** = attained ÷ measurable committed goals (measurable = not
   `not_computable`). The breakdown carries both counts.
5. **Deadline load** buckets are disjoint and clock-free so each drills to an exact list:
   `overdue`; one bucket per UTC quarter `YYYY-Qn` (open, deadline in the quarter, **not**
   overdue); `after:YYYY-MM-DD` (later deadlines); `none` (no deadline).
6. **Per-goal measures** (`goals.milestone_progress`, `goals.burndown`) drill to the goal dossier
   (documented exception, as in ADR 0025).
7. **Catalogue.** 16 new metrics (version 1) plus `goals.active` (version 2, now available).
   The catalogue has 76 metrics, 66 available. Every formula above is in the catalogue entry.

## Consequences

Adding a goal filter means changing `goalWhere` **and** `matchesGoalQuery`; the reconciliation
tests fail otherwise.
