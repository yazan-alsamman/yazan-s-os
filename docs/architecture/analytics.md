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
