# PEOS Phase 2 — Implementation Plan (Command Center)

Written before implementation, after reading `00`, `01`, `02`, `03`, `04`, `05`, `08` and `10`,
ADRs 0001–0017, the Phase 0 and Phase 1 reports, the Prisma schema, migrations, services,
routes, audit implementation, UI shell and tests. `12_IMPLEMENTATION_GUIDE.md` does not exist.

## 1. Inputs and constraints found in the repository

| Fact                                                                                                                     | Consequence                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| No metric definitions anywhere (Phase 1 gap C7)                                                                          | The metric catalogue is built first                                                         |
| Project health is a manual enum (`not_assessed`, `on_track`, `at_risk`, `blocked`)                                       | Health distribution uses it as-is; no scoring                                               |
| Project lifecycle enum `idea … archived`                                                                                 | "Active" and "production" groupings must be defined explicitly (ADR)                        |
| Certification expiry is derived by `expiryStateOf` / `expiryWhere`                                                       | Reused, never redefined                                                                     |
| Evidence has an optional `date`, plus `verified`/`verified_at`                                                           | Timeline and velocity use `date`; undated evidence is counted separately, never back-filled |
| The audit log records every Phase 1 mutation, in-transaction, with actor, action, entity id and snapshots                | Recent activity is derived from the audit log; no domain-event bus                          |
| `audit_logs (actor_id, created_at)` index exists; owner-leading indexes on projects, evidence, skills and certifications | No new index needed (to be confirmed by query review)                                       |
| ECharts chosen (ADR 0007) but not installed                                                                              | Install it, tree-shaken, with an accessible wrapper                                         |

## 2. Work order

1. Metric catalogue: typed registry, governance fields, availability; unit-tested.
2. Analytics services: period resolution, metric calculators (Prisma aggregates), activity,
   timeline, attention list; dashboard composer.
3. API: `GET /api/v1/analytics/{metrics,dashboard,activity,evidence-timeline}`, plus
   backward-compatible list filters needed for drill-down (`lifecycle`, `completedFrom/To`,
   `dated`, `hasEvidence`).
4. UI: Command Center (filters in the URL, KPI strip with definition drawer, sections, charts with
   data tables, activity, timeline, attention, empty/first-run states) and a metric catalogue page.
5. Tests: unit, integration, cross-user authorization (HTTP), E2E with axe, regression.
6. Docs: metric catalogue, analytics architecture, API, ADRs, report.
