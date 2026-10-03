# ADR 0051 — Engineering Analytics: cross-domain activity, temporal semantics, and unavailable integrations

**Status:** Accepted · 2026-10-04 · Phase 9

## Context

`08_IMPLEMENTATION_PHASES.md` defines Phase 9 as external integrations (GitHub, CI/CD, issue
tracker, deployment) and DORA-style metrics (deployment frequency, lead time, change failure rate,
time to restore) plus technical debt, with the acceptance "metrics clearly show source and
freshness". `05_ANALYTICS_METRICS.md` qualifies this: support DORA concepts **only where data
exists** and **"do not fabricate metrics when integrations are unavailable."** PEOS has no
integration data sources, and the metric catalogue already reserved the integration-dependent
metrics as `unavailable`. PEOS also already ships 100+ governed metrics across every domain. The
challenge: deliver a coherent Engineering Analytics layer without fabricating integration data and
without duplicating existing domain analytics.

## Decision

1. **Scope reconciliation.** The integration/DORA/technical-debt metrics have no data source and are
   **kept explicitly unavailable** (never fabricated). The data-backed Phase 9 deliverable is a
   unified **Engineering Analytics** surface that turns PEOS's own dated records into a cross-domain
   view of engineering activity over time. The integrations surface (`/engineering` nav section) is
   deferred until an integration exists.

2. **Cross-domain engineering activity (new metrics, category `engineering`).**
   - `engineering.activity` — count of dated engineering events in the period across all domains.
   - `engineering.activity_trend` — the same events per calendar month (continuous series).
   - `engineering.activity_by_domain` — the distribution of the period's events across domains
     (engineering focus).
     An **event** is one authoritative dated record per domain, counted once by its recorded date:
     `Project.completedAt`, `Milestone.completedAt`, `Evidence.date`, `Goal.completedAt`,
     `ArchitectureDecision.decidedAt`, `ExperimentRun.runAt`, `Certification.issueDate`. Skill
     demonstrations are represented by their evidence (never double-counted). These are **recorded
     output, not time spent** — PEOS stores no time tracking, so no time-spent metric is invented and
     no opaque engineering/productivity score is produced.

3. **Reuse, no duplication (ADR 0019 governance).** The service reuses the metric catalogue,
   `MetricResult`, `period.ts` (UTC calendar-day boundaries, inclusive; `previousPeriod`),
   `comparisonFor` and `monthlyCounts`. It adds no new domain calculation. By-domain project and
   milestone counts reconcile with the authoritative portfolio metrics
   (`projects.delivery_trend`, `projects.milestones_completed_in_period`) — integration-tested.

4. **Missing-data semantics.** `no_data` (no engineering records at all) → value null;
   `insufficient_data` (records exist but none carry the dates activity is measured from) → value
   null; a real `zero` (records exist and are dated, but none fall in the period). A previous-period
   comparison is offered only for a bounded period **and** when history exists before it — otherwise
   `unavailable` or `not_applicable`, never a misleading 0 %.

5. **Computation, not storage.** Everything is computed on request from source records with two
   owner-scoped SQL aggregates (no N+1, no stored snapshots, no historical fabrication). **No
   database changes** were required.

6. **Integration metrics stay honest.** `engineering.deployment_frequency`, `engineering.lead_time`,
   `engineering.change_failure_rate`, `engineering.time_to_restore` and
   `engineering.technical_debt_trend` are catalogued as `unavailable` with their source and the
   reason they cannot be computed, and surfaced as such on the analytics page. Their `plannedPhase`
   was reclassified from "Phase 9" to "requires an engineering integration" to stay accurate after
   Phase 9.

7. **Security & reuse of conventions.** `GET /api/v1/analytics/engineering` uses `defineUserRoute`
   with the analytics rate limit; identity is always from the session; an injected `userId`/`ownerId`
   is ignored; query params are validated and the date range is bounded. The Copilot's fixed
   twelve-tool set is unchanged (Phase 9 added no Copilot tool).

## Consequences

PEOS gains a coherent, cross-domain Engineering Analytics surface that reconciles with its
authoritative metrics, honours the missing-data and temporal rules, and never fabricates data or
scores. True DORA/integration analytics remain a future capability gated on an integration, honestly
surfaced as unavailable. See [[0019-metric-catalogue-and-result-contract]],
[[0020-dashboard-filters-and-drill-down]], [[0025-portfolio-analytics-and-dossier]].
