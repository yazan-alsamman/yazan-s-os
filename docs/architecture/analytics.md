# PEOS Analytics & Command Center Architecture (Phase 2)

Decisions: ADR 0018 (lifecycle groups), ADR 0019 (catalogue and result contract), ADR 0020
(filters and drill-down), ADR 0021 (activity and timeline). The metric list is in
[metric-catalogue.md](metric-catalogue.md).

## Layers

```
metric-catalogue.ts   definitions (Zod-validated at load, versioned) ── GET /api/v1/analytics/metrics
        │
period.ts             range presets → UTC inclusive day bounds; previous period
dashboard.schemas.ts  filters (URL ↔ query) — no identity fields
        │
dashboard.service.ts  calculators: Prisma count / groupBy, one parameterised $queryRaw (monthly series)
activity.service.ts   audit_logs → safe ActivityItem DTOs
timeline.service.ts   dated evidence + bounded related links
        │
metric-result.ts      MetricResult { value, state, stateReason, temporal, period, comparison, breakdown, filtersApplied, source }
        │
/api/v1/analytics/{dashboard,activity,evidence-timeline}   defineUserRoute → session ctx, rate limit "analytics"
        │
src/components/command-center/*   TanStack Query (staleTime 0) → widgets; URL-synced filters; drill-down hrefs
src/components/charts/*           EChart (SVG, aria, decals, theme tokens) + ChartCard (data table, CSV)
```

## Request flow (dashboard)

1. `defineUserRoute` authenticates the request, rate-limits it (120/min per user) and builds
   `ServiceContext { userId, requestId }` from the session.
2. `dashboardFiltersSchema` validates the query. Unknown keys are stripped, and invalid input
   returns 400.
3. `resolvePeriod` turns the range into UTC calendar-day bounds. `previousPeriod` gives the
   preceding period of the same length.
4. The calculators run in parallel. Every `where` includes `userId`.
5. Each result is wrapped by `metricResult()`, which applies the state rules. A previous-period
   comparison is offered only when `comparisonFor()` finds history before the period starts.
6. The response includes `calculatedAt`, the period, per-section filter labels, record counts and
   `hasAnyData`, which drives the first-run panel.

## Widgets

| Widget               | Data                                                                                                             | Drill-down                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| KPI strip (7)        | active, completed in period, production, evidence total, velocity, skills with evidence, certifications expiring | each KPI → filtered list (ADR 0020)              |
| Project health       | `projects.health_distribution` (manual field, zero buckets kept)                                                 | bucket → `/projects?healthStatus=…`              |
| Needs attention      | blocked/at-risk projects (not archived), expired/expiring certifications, ≤ 10 each                              | record detail                                    |
| Evidence over time   | monthly verified/unverified by evidence date (≤ 120 months, zero months filled)                                  | month → `/evidence?dateFrom=…&dateTo=…`          |
| Evidence timeline    | dated evidence, newest first, related links; undated count                                                       | record, related records, `/evidence?dated=false` |
| Skill snapshot       | totals, with/without evidence, by category (≤ 12 + Other + Uncategorised), top 10 by evidence                    | facts and categories → `/skills?…`               |
| Certification expiry | valid / expiring (90 days) / expired / no expiry date; excludes revoked                                          | bucket → `/certifications?expiry=…&current=true` |
| Recent activity      | the caller's audit log, excluding `auth.*`, 15 per page                                                          | existing records only                            |

## Accessibility

- Every chart has `role="img"` with a one-sentence summary. ECharts' own aria description is
  overridden with the same summary.
- Each chart has a decal pattern per series, so colour is never the only cue.
- Values are printed on the bars.
- Each chart has a "Show data table" button that reveals a real `<table>` with drill-down links,
  plus a CSV download.
- KPI links have a full accessible name, such as "Active projects: 2. View the records".
- A KPI with no value reads "no value" and gives its reason.
- The definition drawer returns focus to the button that opened it.
- A polite live region announces when the dashboard updates.
- Animation is turned off under `prefers-reduced-motion`.

## Performance

Measured on PostgreSQL 17 (local) with one user holding 1,000 projects, 500 skills, 10,000 evidence
items, 200 certifications and 20,000 audit rows. Each endpoint ran 10 times after a warm-up.

| Endpoint            | Median (ms) | Max (ms) |
| ------------------- | ----------- | -------- |
| Dashboard, 90 days  | 34          | 47       |
| Dashboard, all time | 33          | 38       |
| Dashboard, filtered | 28          | 31       |
| Activity            | 20          | 22       |
| Evidence timeline   | 18          | 21       |

The queries use existing indexes: `(user_id, status)`, `(user_id, date)`,
`(user_id, expiry_date)`, `(user_id, category)` and `audit_logs (actor_id, created_at)`.

ECharts is loaded lazily as its own chunk (about 549 KB raw, about 185 KB gzip), so the KPIs render
before the charts.

## Phase 3 — project intelligence

- **Milestones** (`src/modules/milestones`): the rules are pure (`milestone.rules.ts`). `overdueWhere` mirrors `isOverdue` for SQL.
- **Computed health** (`src/modules/projects/project-health.ts`): pure, versioned and explained per component (ADR 0024). `computeHealthForProjects` loads inputs for any number of projects with three queries: milestone status counts, overdue counts and recent activity.
- **Dossier intelligence** (`project-intelligence.ts`): about 10 parallel owner-scoped aggregates plus two lookups. The timeline and related skills are capped.
- **Portfolio** (`src/modules/analytics/portfolio.service.ts`): distributions use `groupBy`; the trends use two parameterised monthly series. Computed health is evaluated for every project and is not stored.
- **Drill-down:** all mappings live in `src/components/command-center/drilldown.ts` (ADR 0020 and ADR 0025). The unit test requires a mapping for every available metric; integration tests assert that each value equals its list total.

### Phase 3 performance

Measured on PostgreSQL 17.10 against a local Docker database. One user held 1,000 projects, 20,000 milestones, 10,000 evidence items (each linked to a project), 500 technologies (5,000 usages) and 50,000 audit rows. Each call ran once as an excluded warm-up and then 10 timed times, through the service layer. The benchmark was run twice.

| Call                                             | Median, run 1 (ms) | Max, run 1 (ms) | Median, run 2 (ms) | Max, run 2 (ms) |
| ------------------------------------------------ | ------------------ | --------------- | ------------------ | --------------- |
| Project detail (record and relationships)        | 35.4               | 48.0            | 38.3               | 48.6            |
| Project intelligence (dossier, including health) | 45.5               | 55.1            | 54.2               | 59.9            |
| Project milestones, page of 50                   | 9.0                | 10.0            | 15.8               | 18.5            |
| Milestones across projects, overdue              | 17.2               | 1711.1¹         | 13.7               | 20.0            |
| Project activity, page 1                         | 43.4               | 54.9            | 46.1               | 52.5            |
| Portfolio, 365 days                              | 79.0               | 84.3            | 78.4               | 96.7            |
| Portfolio, all time                              | 76.1               | 87.1            | 74.0               | 80.8            |
| Computed health list (all projects)              | 63.0               | 67.7            | 58.8               | 77.3            |

¹ A single outlier right after the bulk insert, most likely autovacuum or statistics collection. It did not recur on run 2.
