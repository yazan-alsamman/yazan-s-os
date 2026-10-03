# Phase 9 — Engineering Analytics — Implementation Report

**Date:** 2026-10-04 · **Phase:** 9 (Engineering Analytics) · **Status:** Complete
**Principle:** _Data → Metric → Interpretation. Never Data → Arbitrary Score._

---

## 1. Executive Summary

Phase 9 adds a unified **Engineering Analytics** surface (`/analytics`) that turns PEOS's own
structured, dated records into a coherent cross-domain view of engineering activity over time. It
introduces three governed metrics — `engineering.activity` (count, with a previous-period
comparison), `engineering.activity_trend` (monthly series) and `engineering.activity_by_domain`
(focus distribution) — built **only** from authoritative recorded dates across all seven domains,
reconciling with the existing domain analytics. No opaque engineering/productivity score is produced,
no time-spent metric is invented (PEOS has no time tracking), and no historical state is fabricated.

The integration/DORA metrics that `08`/`05` associate with Phase 9 (deployment frequency, lead time,
change failure rate, time to restore, technical debt) have **no data source** in PEOS; per `05`
("do not fabricate metrics when integrations are unavailable") they are catalogued and surfaced as
explicitly **unavailable**, with their source and reason. **Zero database changes** were required.
All regression suites pass.

## 2. Scope

**In scope (implemented):** the `/analytics` Engineering Analytics page; a new authoritative
`engineering-analytics.service.ts`; three new available `engineering.*` metrics plus four catalogued
`unavailable` DORA metrics; `GET /api/v1/analytics/engineering`; comparison periods, trend and focus
distribution with drill-down and source visibility; honest unavailable-integration surface; ADR 0051;
documentation; unit, integration, authorization and E2E (incl. axe) tests.

**Explicitly out of scope (NOT started):** external integrations (GitHub/CI/CD/issue
tracker/deployment) and real DORA metrics (no data source); Phases 10–13 (Evidence Vault expansion,
Opportunities, Premium UX, Production Hardening, Continuous Intelligence); autonomous
recommendations, monitoring, scheduled analytics or alerts; any speculative warehouse/OLAP/event
sourcing; speculative refactors. No stable Phase 0–8 system was rewritten.

## 3. Repository State

- **Path:** `C:/Users/Lenovo/Desktop/yazan/Yazan_Personal_Engineering_OS_Spec`
- **Branch:** `main` · **Remote:** `origin` → `github.com/yazan-alsamman/yazan-s-os.git` (not pushed
  by this phase).
- **Commits:** see §22-commits / the final response (focused commits, explicit paths, no `git add -A`).
- Only the PEOS repository was modified. No unrelated repository was touched.

New files: `src/modules/analytics/engineering-analytics.service.ts` (+ `.test.ts`),
`src/app/api/v1/analytics/engineering/route.ts`, `src/components/analytics/engineering-analytics.tsx`,
`src/app/(app)/analytics/page.tsx`, `docs/decisions/0051-engineering-analytics.md`,
`tests/integration/engineering-analytics.int.test.ts`,
`tests/integration/engineering-analytics-authz.int.test.ts`, `tests/e2e/phase9.spec.ts`, this report.
Minimal edits: `metric-catalogue.ts` (+its test), `drilldown.ts` (+its test), `navigation.ts`
(+its test), `tests/e2e/phase2.spec.ts` (reworded unavailable assertion), and the docs.

## 4. Specification Inspection

Read before coding: `00`–`11` specifications (notably `05_ANALYTICS_METRICS.md`,
`08_IMPLEMENTATION_PHASES.md`, `02_UX_UI_DESIGN.md`), all Phase 0–8 reports, ADRs 0019–0050, the
Prisma schema and migrations, and the existing analytics stack — metric catalogue (101 metrics),
`metric-result.ts`, `period.ts`, `dashboard.service.ts` (Command Center), `portfolio.service.ts`,
`skills/goals/architecture/experiments` analytics services, `activity.service.ts`,
`timeline.service.ts`, drill-down helpers, and the per-domain analytics UIs.

## 5. Existing Analytics Reused (no duplication)

Metric catalogue + governance (ADR 0019); `MetricResult` and its states; `period.ts` (UTC
calendar-day boundaries, `previousPeriod`); `comparisonFor` (history-gated comparison);
`monthlyCounts` and the month-bucketing helpers (from `portfolio.service`); the drill-down helpers
(`metricHref`/`bucketHref`); the chart/KPI components (`KpiCard`, `ChartCard`, `EChart`,
`distributionOption`/`distributionTable`, `MetricDefinitionProvider`); the portfolio service (for
reconciliation). No domain calculation (project health, skill level, goal risk, etc.) was
reimplemented.

## 6. New Metrics

| Field                 | `engineering.activity`                                                                                                                                    | `engineering.activity_trend`     | `engineering.activity_by_domain`        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------- |
| Name                  | Engineering activity                                                                                                                                      | Engineering activity trend       | Engineering activity by domain          |
| Definition            | Dated engineering events in the period across all domains                                                                                                 | Those events per calendar month  | Distribution of events across domains   |
| Formula               | Σ COUNT(event_date ∈ period) over the 7 domains                                                                                                           | COUNT GROUP BY month(event_date) | COUNT(in period) GROUP BY domain        |
| Source                | Project.completedAt, Milestone.completedAt, Evidence.date, Goal.completedAt, ArchitectureDecision.decidedAt, ExperimentRun.runAt, Certification.issueDate | same                             | same                                    |
| Frequency             | On request (live)                                                                                                                                         | On request                       | On request                              |
| Owner                 | PEOS Engineering Analytics                                                                                                                                | same                             | same                                    |
| Value type / temporal | count / period                                                                                                                                            | distribution / period            | distribution / period                   |
| Availability          | Available                                                                                                                                                 | Available                        | Available                               |
| Category              | engineering                                                                                                                                               | engineering                      | engineering                             |
| Caveats               | recorded output not time spent; no double-count; UTC days; undated never counted                                                                          | + ≤120 months                    | + a distribution, not effort/importance |
| Drill-down            | Engineering Analytics detail for the period                                                                                                               | the month's records (per domain) | each domain → its records in the period |

Catalogued as **unavailable** (no data source; never fabricated): `engineering.deployment_frequency`,
`engineering.lead_time`, `engineering.change_failure_rate`, `engineering.time_to_restore`,
`engineering.technical_debt_trend`, plus the pre-existing `projects.health_component.issue_severity`
(all reclassified to "requires an engineering integration"). Catalogue: **108 metrics, 96 available,
12 unavailable.**

## 7. Temporal Semantics

- **Timezone / boundaries:** whole UTC calendar days, inclusive (`period.ts`). "Today" is the UTC day.
- **Dates used:** only the recorded dates above — never `createdAt`, `updatedAt` or audit time.
- **Comparison:** the previous equal-length period; offered only for a bounded period **and** when at
  least one event is dated before the period starts; otherwise `unavailable` (bounded, no history) or
  `not_applicable` (all-time). Never a misleading 0 %.
- **History:** not stored and never reconstructed. The trend is bounded to the latest 120 months and
  flags truncation.

## 8. Cross-Domain Analytics

`engineering.activity` and `engineering.activity_by_domain` aggregate seven domains into one measure,
using only each record's authoritative date (persisted facts, never name-matching). The by-domain
breakdown is the cross-domain relationship surfaced; per-domain drill-downs lead to the domain's own
records for the period, which carry the real relationships (projects↔evidence, goals↔projects, etc.).

## 9. API

`GET /api/v1/analytics/engineering` — `defineUserRoute`, analytics rate limit, identity from session,
`engineeringFiltersSchema` (`range`, `from`, `to`; custom range bounded to ≤ 20 years). Returns the
three metric results, per-domain record counts, period, `calculatedAt`/`evaluatedOn`, and the list of
unavailable integration metrics. `userId`/`ownerId` in the query are ignored.

## 10. UI

`/analytics` (new nav "Analytics", now available): a date-range/comparison filter; the engineering
activity KPI (with comparison); the activity trend chart (bar, monthly) and the activity-by-domain
distribution (horizontal bars), each with interpretation, source/definition drawer, data table, CSV
export, loading/empty/insufficient/error states and drill-down; an "Integration metrics
(unavailable)" section listing the DORA/technical-debt metrics with source and reason; and links into
every per-domain analytics surface and the metric catalogue. Built entirely from the existing design
system.

## 11. Command Center Integration

No Command Center metric changed. The new metrics reuse the same catalogue, `MetricResult`, period
and drill-down machinery, so semantics are identical. A reconciliation integration test asserts the
by-domain project/milestone counts equal the authoritative portfolio metrics
(`projects.delivery_trend`, `projects.milestones_completed_in_period`).

## 12. AI Copilot Integration

Unchanged. The Copilot's fixed twelve-tool set already exposes authoritative metrics
(`getCareerMetrics`, `getProjectMetrics`); Phase 9 adds no Copilot tool and does not alter grounding.
Engineering activity is available through the API and UI; adding a Copilot tool would require its own
ADR and is not a Phase 9 requirement.

## 13. Performance

Measured on the test database (~3,500 dated events across the 7 domains, one user; 7 runs each):

| Range | Median  | Worst          |
| ----- | ------- | -------------- |
| 90d   | 10.2 ms | 55.3 ms (cold) |
| 365d  | 12.0 ms | 14.1 ms        |
| all   | 10.3 ms | 10.8 ms        |

The whole surface is two owner-scoped SQL aggregates (a UNION-ALL `COUNT … FILTER` matrix and a
UNION-ALL monthly `GROUP BY`) over indexed date columns — no N+1, nothing loaded into JS to be
counted, bounded result sizes (≤ 120 months). Well within the analytics budget.

## 14. Database

**No migrations, indexes or constraints added.** Everything is computed from existing dated columns
(already indexed for the hot paths: `milestones(userId, completedAt)`, `projects.completedAt`, etc.).
No derived analytics are persisted; no snapshot/event model was introduced (none is required and the
spec does not call for one). `prisma validate` passes; `migrate status` = "up to date" on both
databases; drift = 0.

## 15. Security

Owner isolation end to end: every query is `user_id`-scoped; identity is always `ctx.userId` from the
session; `userId`/`ownerId` query params are ignored; the date range is validated and bounded;
result sizes are bounded. Tested (HTTP, two users): anonymous → 401; each user sees only their own
activity; an injected `userId`/`ownerId` never leaks another user's data; invalid parameters → 400.
No endpoint reveals whether another user's record exists.

## 16. Accessibility

**Automated:** `axe` runs clean on `/analytics` in the Phase 9 E2E (WCAG 2.0/2.1/2.2 A & AA tags), on
a populated page and via the shared helper. Charts ship an accessible summary (`ariaLabel`) and a data
table alternative; KPIs, filters and drill-down links are standard accessible controls reused from the
design system. **Manual screen-reader testing was not performed and is not claimed.**

## 17. Testing

| Suite                    | Result                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit (`vitest`)          | **284 passed** (32 files) — incl. `engineering-analytics.test.ts` (6: reconciliation, comparison states, no_data/insufficient/zero, integrations list, record counts) and the updated catalogue/drill-down/nav tests                             |
| Integration (`vitest`)   | **179 passed** (24 files) — incl. `engineering-analytics.int.test.ts` (6) and `engineering-analytics-authz.int.test.ts` (4)                                                                                                                      |
| Authorization            | 2 real users (HTTP): 401 anonymous; per-user isolation; injected userId/ownerId ignored; invalid params 400                                                                                                                                      |
| E2E (`playwright`)       | **Phase 9: 3 passed** (activity + charts + unavailable integrations + axe; honest empty state). Full suite: 103 + Phase 9; one pre-existing AI-Lab viewport test flakes under its rapid viewport loop and passes on rerun (unrelated to Phase 9) |
| Accessibility            | `axe` clean on `/analytics` (automated); manual not claimed                                                                                                                                                                                      |
| Regression               | Phases 0–8 suites pass (see §21)                                                                                                                                                                                                                 |
| `pnpm build`             | **pass**                                                                                                                                                                                                                                         |
| `pnpm typecheck`         | **pass**                                                                                                                                                                                                                                         |
| `pnpm lint`              | **pass** (0 problems)                                                                                                                                                                                                                            |
| `pnpm format:check`      | **pass**                                                                                                                                                                                                                                         |
| `prisma validate`        | **pass**                                                                                                                                                                                                                                         |
| Migration status / drift | "up to date" on `peos` and `peos_test`; **no migrations added**, drift 0                                                                                                                                                                         |
| `pnpm audit --prod`      | **no known vulnerabilities**                                                                                                                                                                                                                     |

### Metric test cases (`engineering.activity`)

Normal data (7 events → 7), real zero (dated records, none in period → `zero`, value 0), no records
(`no_data`, null), records without usable dates (`insufficient_data`, null), date boundary (inclusive
custom `from`/`to`), comparison period (previous value from real history; unavailable without history;
not_applicable for all-time), cross-user (no leakage), reconciliation (total = Σ domains = Σ trend =
portfolio metrics).

## 18. Known Limitations

- **DORA / integration metrics are unavailable** — no CI/CD, version-control or issue-tracking data
  source. They are catalogued and shown with source + reason, never fabricated.
- **Experiment and certification drill-downs are not period-filtered** — their list pages have no
  dated filter, so those two by-domain buckets link to the list (the other five are period-accurate).
- **No time tracking** — activity is recorded output, not effort or hours; stated explicitly.
- **Technology heatmap / dated technology usage** remain unavailable (no dates on TechnologyUsage).

## 19. Specification Gaps

Recorded as P9-1…P9-6 in `docs/SPECIFICATION_INDEX.md`: Phase 9's integration/DORA definition has no
data source and stays unavailable (P9-1/P9-2); "engineering activity" defined from dated events
(P9-3); no time data, so output not effort (P9-4); technology heatmap still blocked (P9-5); the
`/engineering` nav section deferred pending integrations, with analytics delivered under `/analytics`
(P9-6).

## 20. Deferred Work

External integrations and real DORA/technical-debt metrics (need a data source + an ADR); a
dedicated `/engineering` integrations surface; period-accurate drill-downs for experiment runs and
certifications (need dated list filters); a Copilot engineering-analytics tool (needs an ADR). Phases
10–13 untouched.

## 21. Regression Status

Phases 0–8 remain intact: authentication, Projects, Skills, Evidence, Goals, AI Lab, Architecture, AI
Copilot, Command Center and existing analytics all pass their unit/integration/E2E suites. The only
behavioural change to existing surfaces is cosmetic: the unavailable engineering metrics'
`plannedPhase` wording (Phase 2 E2E assertion updated accordingly) and the nav "Analytics" section
becoming available. No test was deleted or weakened.

## 22. Phase 10 Readiness

**READY.** Phase 9 is complete and isolated; nothing was started for Phase 10. Phase 10 (Evidence
Vault & Opportunities) is independent of this work. Awaiting human review.
