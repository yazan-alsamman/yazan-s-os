# PEOS Analytics & Command Center Architecture (Phases 2–7)

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

## Phase 4 — skills & career intelligence

- **Signals** (`src/modules/skills/skill-intelligence.service.ts`): three grouped, parameterised aggregates over `skill_evidence ⋈ evidence`, `project_skills ⋈ projects` and `certification_skills ⋈ certifications`, for any number of skills. They are analysed by pure, versioned functions (`skill-intelligence.ts`).
- **Source list:** `/api/v1/skills/intelligence`. Every skill metric uses the same `matchesQuery` predicate, so each count equals its drill-down list total (integration-tested).
- **Career analytics** (`skills-analytics.service.ts`): coverage, critical gaps, targets without evidence, production evidence, freshness, levels, gaps, trend and radar. The Command Center reuses it for its Skill Coverage and Critical Skill Gaps KPIs.
- **Career graph** (`career-graph.service.ts`): bounded and deterministic, built from real join rows only (ADR 0030).

### Phase 4 performance

Measured on PostgreSQL 17.10 against a local Docker database. One user held:

- 1,000 projects
- 150 skills
- 500 technologies
- 12,000 evidence items
- 12,000 skill–evidence links
- 3,000 project–skill links
- 5,000 technology usages
- 1,000 technology–skill links
- 200 certifications (400 certification–skill links)
- 50,000 audit rows

Each call ran once as an excluded warm-up, then 10 timed times, through the service layer. The median is the mean of the 5th and 6th runs.

| Call                                   | Run a       | Run c (`ANALYZE` after load) | Run b (no `ANALYZE`) | Run d (no `ANALYZE`) |
| -------------------------------------- | ----------- | ---------------------------- | -------------------- | -------------------- |
| Skill list (Phase 1)                   | 10.5 / 20.3 | 11.0 / 23.4                  | 252.8 / 318.5        | 277.4 / 328.0        |
| Skill detail (Phase 1)                 | 18.7 / 25.5 | 18.0 / 26.4                  | 174.5 / 186.3        | 173.0 / 205.8        |
| Skill intelligence (dossier)           | 24.9 / 30.4 | 28.4 / 43.3                  | 203.1 / 273.9        | 215.6 / 275.4        |
| Gap list / heatmap                     | 28.3 / 37.5 | 28.8 / 30.2                  | 32.6 / 36.7          | 54.6 / 58.2          |
| Freshness filter                       | 26.8 / 32.2 | 27.4 / 29.6                  | 28.3 / 33.1          | 51.9 / 55.6          |
| Career analytics + radar               | 28.9 / 36.7 | 28.9 / 30.7                  | 28.8 / 32.4          | 53.5 / 83.4          |
| Career graph overview (80)             | 27.3 / 39.4 | 26.4 / 29.3                  | 26.4 / 30.8          | 304.5 / 387.8        |
| Career graph overview (150, all types) | 35.2 / 37.9 | 37.4 / 46.0                  | 38.1 / 43.8          | 301.3 / 322.8        |
| Career graph focus                     | 16.4 / 22.7 | 18.3 / 28.8                  | 15.6 / 19.3          | 21.3 / 22.0          |
| Command Center dashboard               | 66.5 / 81.7 | 67.3 / 87.7                  | 57.1 / 69.5          | 447.1 / 536.5        |

Each cell is median / max in milliseconds.

**Outliers.** Runs b and d were up to 10× slower on the Phase 1 skill list and detail, the dossier, the graph overview and the dashboard. The cause was verified: the benchmark bulk-loads freshly truncated tables, and the planner used stale statistics until `ANALYZE` ran. Run c, with an explicit `ANALYZE`, reproduces the fast numbers. In normal use autovacuum maintains statistics, and rows arrive incrementally.

**Caching:** none. Phase 4 adds no indexes beyond the primary keys and `skill_id` / `level_model_id` indexes of the new tables; the existing join-table indexes cover the aggregates.

## Phase 5 — goals & roadmap

- **Signals** (`src/modules/goals/goal-intelligence.ts`): `analyseGoals` loads the goals, then runs six parallel owner-scoped aggregates: linked milestones (total, completed, overdue, blocked), contributing projects (delivered, manual at-risk/blocked), goal–skill links, dependencies (blocking = cancelled or overdue), the latest measurement (`DISTINCT ON`) and measurement counts. Linked skills are analysed once with the Phase 4 `analyseSkills`, so goal skill readiness is the same value as the skill dossier. Unfiltered calls scope the aggregates by owner instead of a long id list.
- **Pure rules** (`goal.rules.ts`): `goal-lifecycle-v1`, `goal-attainment-v1` and `goal-risk-v1` (ADRs 0031 and 0033). No composite progress score exists.
- **Source list:** `/api/v1/goals`. Structural filters run in SQL (`goalWhere`); derived filters (`overdue`, `risk`, `attainment`, `skillGap`) run on the analysed set (`matchesDerived`). The analytics service evaluates every goal metric with `matchesGoalQuery`, which mirrors `goalWhere` and calls the same `matchesDerived`, so each value equals its drill-down list total (integration-tested for every metric and bucket).
- **Goal analytics** (`goals-analytics.service.ts`): total, active, overdue, completion rate, at risk, on track, risk/status/attainment distributions, target attainment, coverage gaps (no deadline, projects or skills; skill gaps), deadline load and the at-risk attention list. The Command Center reuses it for the Active goals KPI and the attention panel.
- **Roadmap** (`roadmap.service.ts`): one analysis plus one dependency query. The timeline is capped at 500 goals, undated goals at 50 shown (with the full count); quarters are UTC calendar quarters (≤ 40).

### Phase 5 performance

Measured on PostgreSQL 17.10 against a local Docker database. One user held:

- 1,000 goals (10 North Stars, 90 annual objectives, 900 quarterly goals)
- 5,000 goal relationships: 2,000 goal–project, 1,500 goal–skill, 500 dependencies, 1,000 milestone links
- 1,002 measurements
- 1,000 projects, 3,000 milestones
- 150 skills, 12,000 evidence items, 12,000 skill–evidence links (Phase 4 volume)
- 50,000 audit rows

Each call ran once as an excluded warm-up, then 10 timed times, through the service layer. The median is the mean of the 5th and 6th runs. Cells are median / max in milliseconds.

| Call                                   | Run a (`ANALYZE`) | Run b (no `ANALYZE`) | Run c (no `ANALYZE`) |
| -------------------------------------- | ----------------- | -------------------- | -------------------- |
| Goal list (page 1, sort deadline)      | 78.2 / 107.4      | 77.5 / 116.3         | 89.8 / 115.6         |
| Goal list (risk = at risk, sort risk)  | 78.7 / 83.5       | 73.3 / 78.7          | 78.0 / 92.2          |
| Goal list (search + open)              | 39.1 / 50.3       | 40.7 / 43.8          | 39.3 / 45.0          |
| Goal detail (record)                   | 2.6 / 3.2         | 3.5 / 4.4            | 2.3 / 2.5            |
| Goal intelligence (dossier)            | 47.3 / 67.8       | 48.8 / 83.9          | 47.8 / 69.4          |
| Goal analytics (summary)               | 82.8 / 87.9       | 83.4 / 102.6         | 79.1 / 91.6          |
| Roadmap (default window)               | 75.9 / 92.8       | 80.2 / 100.2         | 75.6 / 86.1          |
| Roadmap (5-year window)                | 78.8 / 103.5      | 82.5 / 94.7          | 78.9 / 90.5          |
| Command Center dashboard (incl. goals) | 114.8 / 152.9     | 128.2 / 137.7        | 120.1 / 130.5        |
| Skill intelligence list (Phase 4 path) | 25.9 / 29.1       | 26.3 / 30.1          | 26.1 / 29.5          |

**Planner statistics (verified).** Before the final code, a run without `ANALYZE` measured the dossier at 1,373.6 ms. A per-query breakdown in the same stale-statistics state showed the cause: listing a goal's projects through a projects-side semi-join (`project.goals.some`) took 1,318.6 ms, while the same rows read from `goal_projects` by its primary key took 9.2 ms. The dossier now reads from the link table; runs b and c above are without `ANALYZE`. Earlier no-`ANALYZE` runs also measured the unfiltered goal list at 163–184 ms (before the owner-scoped aggregate change); they did not recur in the final runs. Statistics still matter for other relation filters (`goalWhere` uses `some` for `projectId`, `skillId`, `hasProjects` and `hasSkills`), so bulk benchmarks must `ANALYZE` after loading.

**Caching:** none. Phase 5 adds the indexes of the new tables only: `goals(user_id, status, deadline)`, `goals(parent_id)`, `goal_projects(project_id)`, `goal_skills(skill_id)`, `goal_dependencies(depends_on_goal_id)`, `goal_measurements(goal_id, date)` and `milestones(goal_id)`.

## Phase 6 — AI Lab & experimentation

- **Signals** (`src/modules/experiments/experiment-intelligence.ts`): `analyseExperiments` loads the
  experiments, then two owner-scoped raw aggregates over `experiment_runs` (run counts by status,
  reproducibility-field completeness, evaluated-run count, measured-value counts) and a
  `DISTINCT ON` latest-run query, plus an evidence `groupBy`. Unfiltered calls scope by owner.
- **Source list:** `/api/v1/experiments`. Structural filters run in SQL (`experimentWhere`);
  derived filters (`hasEvaluation`, `reproducibility`) on the analysed set. The analytics service
  evaluates every metric with `matchesExperimentQuery` (mirrors `experimentWhere` + `matchesDerived`),
  so each count equals its drill-down total (integration-tested).
- **Comparison** (`comparison-v1`, ADR 0038): pure diff of two runs; no overall winner.
- **Reproducibility** (`reproducibility-v1`, ADR 0039): recorded-metadata completeness only.
- **Descriptive measurements:** cost/latency/token sums and averages over runs that recorded a
  value — not governed KPIs, never zero-filled.

### Phase 6 performance

Dataset (one user): 1,000 experiments, 2,500 runs, 3,332 recorded evaluation metrics, 50 projects.
PostgreSQL 17.10, service layer, 1 warm-up + 10 timed runs; median = mean of runs 5 and 6. Cells
are median / max ms.

| Call                                    | Run a (`ANALYZE`) | Run b (no `ANALYZE`) | Run c (no `ANALYZE`) |
| --------------------------------------- | ----------------- | -------------------- | -------------------- |
| Experiment list (page 1, recent)        | 32.3 / 47.2       | 36.9 / 53.9          | 40.0 / 49.7          |
| Experiment list (reproducibility)       | 30.5 / 40.8       | 35.2 / 38.6          | 36.9 / 49.4          |
| Experiment dossier                      | 11.2 / 12.1       | 12.0 / 12.6          | 14.2 / 23.3          |
| Run comparison                          | 8.3 / 9.5         | 7.3 / 9.5            | 9.7 / 12.1           |
| AI Lab analytics                        | 40.4 / 45.4       | 46.1 / 56.7          | 53.7 / 60.3          |
| Command Center dashboard (incl. AI Lab) | 68.9 / 86.2       | 85.9 / 99.8          | 83.6 / 96.1          |

The AI Lab aggregates are small (two grouped run queries + one latest-run query + one evidence
aggregate), so unlike the Phase 4/5 bulk loads there was **no stale-statistics outlier** — the
no-`ANALYZE` runs track the `ANALYZE` run. Statistics still matter after very large imports, so
bulk benchmarks should `ANALYZE` after loading.

**Query strategy:** one experiment query + two run aggregates + one latest-run query + one evidence
aggregate for any number of experiments (no N+1); the dossier adds bounded run/metric/evidence
reads; comparison loads exactly two runs. Lists are paginated (≤ 100); runs ≤ 500 and metrics ≤ 100
per parent. No caching; only the new tables' indexes were added.

## Phase 7 — Architecture Intelligence

- **Decisions** (`src/modules/architecture/architecture-intelligence.ts`): one decision query and
  five grouped counts (projects, evidence, alternatives, components, critical components) for any
  number of decisions; revisit, stale-critical and documentation gaps come from the pure rules.
- **Components:** one component query and six grouped counts (projects, technologies, depends on,
  used by, decisions, decisions in force).
- **Map:** one node query (bounded, critical first), one edge query between included nodes and one
  grouped decision count. Never an unbounded graph.
- **Source lists:** decisions, components and projects (`hasArchitecture`); every metric and bucket
  equals its list total (integration-tested).

### Phase 7 performance

Dataset (one user): 2,000 decisions, 1,000 components, 1,000 projects, 2,000 decision–project
links, 4,000 decision–component links, 1,000 decision–evidence links, 2,000 alternatives, 2,000
component dependencies, 1,000 component–project and 1,000 component–technology links, 50,000 audit
rows. Service layer, 1 warm-up + 10 timed runs; cells are median / max ms.

| Call                                          | Run a (`ANALYZE`) | Run b (no `ANALYZE`) | Run c (no `ANALYZE`) |
| --------------------------------------------- | ----------------- | -------------------- | -------------------- |
| Decision list (page 1)                        | 54.5 / 65.1       | 59.7 / 79.8          | 55.9 / 68.8          |
| Decision list (stale critical)                | 51.2 / 59.4       | 52.0 / 58.6          | 51.1 / 60.3          |
| Decision dossier (incl. history)              | 13.2 / 20.5       | 29.0 / 38.8          | 28.0 / 37.5          |
| Component list (page 1)                       | 30.3 / 40.9       | 31.8 / 36.7          | 32.5 / 43.6          |
| Component dossier                             | 12.4 / 18.9       | 17.2 / 30.3          | 17.5 / 23.8          |
| Architecture map (100 nodes)                  | 8.2 / 9.4         | 8.7 / 10.1           | 8.6 / 10.2           |
| Architecture map (150 nodes)                  | 9.2 / 9.8         | 10.0 / 12.5          | 9.7 / 10.7           |
| Architecture analytics                        | 79.2 / 91.8       | 81.3 / 97.8          | 86.2 / 109.6         |
| Command Center dashboard (incl. architecture) | 106.3 / 131.9     | 119.9 / 142.1        | 114.0 / 133.1        |

**Planner statistics (verified).** The first map implementation used a per-row relation
`_count` of decisions; without `ANALYZE` it measured 652–660 ms. A per-query breakdown in the same
state showed that query at 646.5 ms while the plain node query took 3.6 ms and a grouped decision
count over the same ids 3.8 ms. The map now uses the grouped count (8–10 ms in every run).

## Phase 9 — Engineering Analytics

A unified, cross-domain analytics surface (`/analytics`; `engineering-analytics.service.ts`; ADR 0051) over PEOS's own dated records. It adds three governed metrics in the `engineering` category:

- `engineering.activity` — count of dated engineering events in the period across all domains, with
  a previous-period comparison.
- `engineering.activity_trend` — those events per calendar month (continuous series, zeros real).
- `engineering.activity_by_domain` — the distribution of the period's events across domains
  (engineering focus).

An **event** is one authoritative dated record per domain, counted once by its recorded date:
`Project.completedAt`, `Milestone.completedAt`, `Evidence.date`, `Goal.completedAt`,
`ArchitectureDecision.decidedAt`, `ExperimentRun.runAt`, `Certification.issueDate`. These are
**recorded output, not time spent** (PEOS has no time tracking) — no time-spent metric and no
engineering/productivity score are produced. Skill demonstrations are represented by their evidence,
never double-counted.

**Temporal semantics.** Whole UTC calendar days, inclusive boundaries (`period.ts`). The comparison
is the previous equal-length period and is offered only for a bounded period with history before it;
otherwise `unavailable` or `not_applicable`, never a misleading 0 %. Missing data is distinguished:
`no_data` (no engineering records), `insufficient_data` (records exist but carry no usable dates), a
real `zero` (dated records exist but none in the period).

**Reconciliation (tested).** activity total = Σ domain buckets = Σ trend points; the project and
milestone buckets equal the authoritative portfolio metrics (`projects.delivery_trend`,
`projects.milestones_completed_in_period`).

**Computation, not storage.** Two owner-scoped SQL aggregates compute the whole surface (no N+1, no
stored snapshots). **No database changes** were required.

**Integration/DORA metrics are unavailable, never fabricated.** `engineering.deployment_frequency`,
`engineering.lead_time`, `engineering.change_failure_rate`, `engineering.time_to_restore` and
`engineering.technical_debt_trend` are catalogued and surfaced as unavailable with their source and
reason — PEOS has no CI/CD, version-control or issue-tracking integration (05: do not fabricate).
