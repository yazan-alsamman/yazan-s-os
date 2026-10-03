# PEOS Metric Catalogue (Phases 2–4)

Generated from `src/modules/analytics/metric-catalogue.ts`, which is the source of truth (ADR 0019).
The catalogue is validated by a strict Zod schema when it is loaded, served read-only at
`GET /api/v1/analytics/metrics`, and shown in the app at `/command-center/metrics` and in each
metric's definition drawer.

- **60 metrics**: 49 available, 11 unavailable (each with its reason and the phase or decision
  that unlocks it).
- Phase 3 adds milestone, delivery, computed-health, portfolio, technology and project-evidence
  metrics (ADRs 0022–0025). `projects.delivery_rate` is now available (version 2).
- Phase 4 adds evidence-derived skill metrics (`skill-level-v1`, `freshness-v1`, `skill-trend-v1`,
  `gap-analysis-v1`) and makes skill coverage, critical gaps and freshness available (version 2;
  ADRs 0026–0030). Learning velocity stays unavailable.
- Every metric counts only records owned by the signed-in user.
- Frequency: computed live on request. Nothing is cached, pre-aggregated or estimated.
- Periods are whole UTC calendar days, inclusive. "Today" is the UTC calendar day.
- Result states: `ok`, `zero`, `no_data`, `insufficient_data`, `unavailable` (ADR 0019).
  Computed-health components add `scored` and `not_applicable` (ADR 0024).
- Value types: `count`, `distribution`, `ratio` (0–1; numerator and denominator in the
  breakdown), `score` (0–100; explained by components), `matrix`.

## Summary

| Key                                       | Name                                   | Availability                        | Drill-down                                                                  |
| ----------------------------------------- | -------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| projects.total                            | Projects                               | available                           | Projects list with the same filters                                         |
| projects.active                           | Active projects                        | available                           | Projects list filtered to the active lifecycle group                        |
| projects.production                       | Production systems                     | available                           | Projects list filtered to the production lifecycle group                    |
| projects.completed_in_period              | Projects completed                     | available                           | Projects list filtered to completion dates in the period                    |
| projects.health_distribution              | Project health                         | available                           | Projects list filtered to the selected health state                         |
| projects.lifecycle_distribution           | Projects by lifecycle status           | available                           | Projects list filtered to the selected status                               |
| projects.delivery_rate                    | Delivery rate                          | available                           | Milestones list: completed (status=completed) and overdue (overdue=true)    |
| projects.milestones_total                 | Milestones                             | available                           | Milestones list (per project: projectId filter)                             |
| projects.milestones_completed             | Completed milestones                   | available                           | Milestones list filtered to status=completed                                |
| projects.milestones_completed_in_period   | Milestones completed                   | available                           | Milestones list filtered to completedFrom/completedTo                       |
| projects.milestones_overdue               | Overdue milestones                     | available                           | Milestones list filtered to overdue=true                                    |
| projects.milestones_blocked               | Blocked milestones                     | available                           | Milestones list filtered to status=blocked                                  |
| projects.milestone_completion_trend       | Milestone completions over time        | available                           | Milestones list filtered to the month's completion dates                    |
| projects.delivery_trend                   | Project delivery trend                 | available                           | Projects list filtered to the month's completion dates                      |
| projects.health_score                     | Computed project health                | available                           | Project dossier, Health section (component breakdown)                       |
| projects.health_component.schedule        | Health component: schedule             | available                           | Project dossier, Health section                                             |
| projects.health_component.milestones      | Health component: milestone completion | available                           | Project dossier, Delivery section                                           |
| projects.health_component.blockers        | Health component: blockers             | available                           | Milestones list filtered to the project and status=blocked                  |
| projects.health_component.recent_activity | Health component: recent activity      | available                           | Project dossier, Activity section                                           |
| projects.health_component.scope_stability | Health component: scope stability      | Specification decision required     | —                                                                           |
| projects.health_component.issue_severity  | Health component: issue severity       | Phase 9 — Engineering Analytics     | —                                                                           |
| projects.computed_health_distribution     | Projects by computed health            | available                           | Computed health list filtered to the band                                   |
| projects.health_comparison                | Manual vs computed health              | available                           | Computed health list filtered to manual status and band                     |
| projects.technology_usage                 | Technology usage across projects       | available                           | Projects list filtered to the technology (technologyId)                     |
| projects.evidence_coverage                | Project evidence coverage              | available                           | Projects list filtered to hasEvidence=true / false                          |
| projects.evidence_linked                  | Project evidence                       | available                           | Evidence list filtered to the project (projectId)                           |
| projects.evidence_verified                | Verified project evidence              | available                           | Evidence list filtered to the project and verified=true                     |
| projects.evidence_by_type                 | Project evidence by type               | available                           | Evidence list filtered to the project and type                              |
| projects.blocked_time                     | Blocked time                           | Specification decision required     | —                                                                           |
| projects.portfolio_matrix                 | Project portfolio matrix               | Specification decision required     | —                                                                           |
| projects.technology_heatmap               | Technology heatmap                     | Specification decision required     | —                                                                           |
| evidence.total                            | Evidence items                         | available                           | Evidence list with the same filters                                         |
| evidence.verified                         | Verified evidence                      | available                           | Evidence list filtered to verified                                          |
| evidence.velocity                         | Evidence velocity                      | available                           | Evidence list filtered to verified items dated in the period                |
| evidence.undated                          | Undated evidence                       | available                           | Evidence list filtered to undated items                                     |
| skills.total                              | Skills                                 | available                           | Skills list                                                                 |
| skills.active                             | Active skills                          | available                           | Skills list filtered to active                                              |
| skills.with_target                        | Skills with a target level             | available                           | Skills list filtered to skills with a target                                |
| skills.with_evidence                      | Skills with evidence                   | available                           | Skills list filtered to skills with evidence                                |
| skills.without_evidence                   | Active skills without evidence         | available                           | Skills list filtered to active skills without evidence                      |
| skills.by_category                        | Skills by category                     | available                           | Skills list filtered to the selected category                               |
| certifications.total                      | Certifications                         | available                           | Certifications list                                                         |
| certifications.expiry_distribution        | Certification expiry                   | available                           | Certifications list filtered to the selected expiry state                   |
| certifications.expiring                   | Certifications expiring                | available                           | Certifications list filtered to expiring                                    |
| goals.active                              | Active goals                           | Phase 5 — Goals & Roadmap           | —                                                                           |
| skills.coverage                           | Skill coverage                         | available                           | Skill intelligence list: active, with target, freshness = fresh (numerator) |
| skills.critical_gaps                      | Critical skill gaps                    | available                           | Skill intelligence list filtered to critical=true                           |
| skills.freshness                          | Skill freshness                        | available                           | Skill intelligence list filtered to the freshness state                     |
| skills.current_level                      | Evidence-derived skill level           | available                           | Skill dossier (rule-by-rule breakdown)                                      |
| skills.level_distribution                 | Skills by derived level                | available                           | Skill intelligence list filtered to the level                               |
| skills.gap_distribution                   | Skills by gap state                    | available                           | Skill intelligence list filtered to the gap state                           |
| skills.targets_without_evidence           | Targets without evidence               | available                           | Skill intelligence list filtered to targetWithoutEvidence=true              |
| skills.growth                             | Skill demonstration trend              | available                           | Skill intelligence list filtered to the trend state                         |
| skills.production_evidence                | Skills with production evidence        | available                           | Skill intelligence list filtered to productionLinked=true                   |
| skills.radar                              | Skill radar                            | available                           | Skill dossier per axis; skill intelligence list                             |
| skills.learning_velocity                  | Learning velocity                      | Specification decision required     | —                                                                           |
| evidence.production_ratio                 | Production evidence ratio              | Specification decision required     | —                                                                           |
| ai.experiments                            | AI experiments                         | Phase 6 — AI Lab                    | —                                                                           |
| architecture.decisions                    | Architecture decisions                 | Phase 7 — Architecture Intelligence | —                                                                           |
| engineering.technical_debt_trend          | Technical debt trend                   | Phase 9 — Engineering Analytics     | —                                                                           |

## Definitions

#### `projects.total` — Projects

| Field                 | Value                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.total`                                                                                           |
| Name                  | Projects                                                                                                   |
| Category              | projects                                                                                                   |
| Definition            | Number of projects recorded in PEOS.                                                                       |
| Formula               | `COUNT(projects) where status/health match the dashboard project filters`                                  |
| Source                | Project                                                                                                    |
| Frequency             | On request — computed live from the database when the Command Center loads.                                |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                |
| Caveats               | Only records owned by the signed-in user are counted. • Includes every lifecycle state, archived included. |
| Value type / temporal | count / point_in_time                                                                                      |
| Availability          | Available                                                                                                  |
| Drill-down target     | Projects list with the same filters                                                                        |
| Spec reference        | 01 §3 Project Intelligence                                                                                 |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                             |

#### `projects.active` — Active projects

| Field                 | Value                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.active`                                                                                                                                                                                                                     |
| Name                  | Active projects                                                                                                                                                                                                                       |
| Category              | projects                                                                                                                                                                                                                              |
| Definition            | Projects currently being worked on: lifecycle status Discovery, Architecture, Development or Validation.                                                                                                                              |
| Formula               | `COUNT(projects WHERE status IN (discovery, architecture, development, validation))`                                                                                                                                                  |
| Source                | Project.status                                                                                                                                                                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                           |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                                                                           |
| Caveats               | Only records owned by the signed-in user are counted. • Status is maintained manually; a project counts as active until you change its status. • Ideas, production/maintenance systems and archived projects are excluded (ADR 0018). |
| Value type / temporal | count / point_in_time                                                                                                                                                                                                                 |
| Availability          | Available                                                                                                                                                                                                                             |
| Drill-down target     | Projects list filtered to the active lifecycle group                                                                                                                                                                                  |
| Spec reference        | 00 §4 KPI strip — Active Projects                                                                                                                                                                                                     |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                                                                                                                        |

#### `projects.production` — Production systems

| Field                 | Value                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.production`                                                                                                                 |
| Name                  | Production systems                                                                                                                    |
| Category              | projects                                                                                                                              |
| Definition            | Projects whose lifecycle status is Production or Maintenance.                                                                         |
| Formula               | `COUNT(projects WHERE status IN (production, maintenance))`                                                                           |
| Source                | Project.status                                                                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                           |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                           |
| Caveats               | Only records owned by the signed-in user are counted. • Reflects the status you recorded; PEOS does not verify deployments (Phase 9). |
| Value type / temporal | count / point_in_time                                                                                                                 |
| Availability          | Available                                                                                                                             |
| Drill-down target     | Projects list filtered to the production lifecycle group                                                                              |
| Spec reference        | 00 §4 KPI strip — Production Systems                                                                                                  |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                        |

#### `projects.completed_in_period` — Projects completed

| Field                 | Value                                                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.completed_in_period`                                                                                                                                                                                                                             |
| Name                  | Projects completed                                                                                                                                                                                                                                         |
| Category              | projects                                                                                                                                                                                                                                                   |
| Definition            | Projects whose recorded completion date falls within the selected period.                                                                                                                                                                                  |
| Formula               | `COUNT(projects WHERE completed_at BETWEEN period.start AND period.end)`                                                                                                                                                                                   |
| Source                | Project.completedAt                                                                                                                                                                                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                                                                                                |
| Caveats               | Only records owned by the signed-in user are counted. • Implements the spec's “Projects Shipped (30/90/365 days)” using the completion date you entered; projects without a completion date are not counted. • Period boundaries are calendar days in UTC. |
| Value type / temporal | count / period                                                                                                                                                                                                                                             |
| Availability          | Available                                                                                                                                                                                                                                                  |
| Drill-down target     | Projects list filtered to completion dates in the period                                                                                                                                                                                                   |
| Spec reference        | 00 §4 KPI strip — Projects Shipped (30/90/365 days)                                                                                                                                                                                                        |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                                                                                                                                             |

#### `projects.health_distribution` — Project health

| Field                 | Value                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `projects.health_distribution`                                                                                                                                                                                                                         |
| Name                  | Project health                                                                                                                                                                                                                                         |
| Category              | projects                                                                                                                                                                                                                                               |
| Definition            | Number of projects in each manually assessed health state: On track, At risk, Blocked, Not assessed.                                                                                                                                                   |
| Formula               | `COUNT(projects) GROUP BY health_status`                                                                                                                                                                                                               |
| Source                | Project.healthStatus                                                                                                                                                                                                                                   |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                            |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                                                                                            |
| Caveats               | Only records owned by the signed-in user are counted. • Health is your manual assessment, not a computed score. The derived health score (schedule, blockers, milestones) arrives in Phase 3. • “Not assessed” is shown explicitly rather than hidden. |
| Value type / temporal | distribution / point_in_time                                                                                                                                                                                                                           |
| Availability          | Available                                                                                                                                                                                                                                              |
| Drill-down target     | Projects list filtered to the selected health state                                                                                                                                                                                                    |
| Spec reference        | 01 §3 Project Health; 08 Phase 2 “project health”                                                                                                                                                                                                      |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                                                                                                                                         |

#### `projects.lifecycle_distribution` — Projects by lifecycle status

| Field                 | Value                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- |
| Key                   | `projects.lifecycle_distribution`                                                      |
| Name                  | Projects by lifecycle status                                                           |
| Category              | projects                                                                               |
| Definition            | Number of projects in each lifecycle status.                                           |
| Formula               | `COUNT(projects) GROUP BY status`                                                      |
| Source                | Project.status                                                                         |
| Frequency             | On request — computed live from the database when the Command Center loads.            |
| Owner                 | PEOS Projects domain (src/modules/projects)                                            |
| Caveats               | Only records owned by the signed-in user are counted. • Status is maintained manually. |
| Value type / temporal | distribution / point_in_time                                                           |
| Availability          | Available                                                                              |
| Drill-down target     | Projects list filtered to the selected status                                          |
| Spec reference        | 05 Portfolio Analytics — active vs archived                                            |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                         |

#### `projects.delivery_rate` — Delivery rate

| Field                 | Value                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.delivery_rate`                                                                                                                                                                                                                                                                                                                                                     |
| Name                  | Delivery rate                                                                                                                                                                                                                                                                                                                                                                |
| Category              | projects                                                                                                                                                                                                                                                                                                                                                                     |
| Definition            | Share of milestones that are complete, among milestones that are either complete or past their planned date (spec 05 'completed milestones / planned milestones').                                                                                                                                                                                                           |
| Formula               | `COUNT(completed) / (COUNT(completed) + COUNT(overdue)); overdue = open (planned/in progress/blocked) AND dueDate < today (UTC) AND project not archived; cancelled milestones excluded`                                                                                                                                                                                     |
| Source                | Milestone.status, Milestone.dueDate, Project.status                                                                                                                                                                                                                                                                                                                          |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                                                                                                                                  |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                                                                                                                                                                                                                  |
| Caveats               | Only records owned by the signed-in user are counted. • Shown as a ratio only when the denominator is at least 1; otherwise the state is insufficient_data (never 0%). • Milestones not yet due and undated open milestones are neither delivered nor late, so they are excluded. • Evaluated as of today (UTC calendar day); computed per project and across the portfolio. |
| Value type / temporal | ratio / point_in_time                                                                                                                                                                                                                                                                                                                                                        |
| Availability          | Available                                                                                                                                                                                                                                                                                                                                                                    |
| Drill-down target     | Milestones list: completed (status=completed) and overdue (overdue=true)                                                                                                                                                                                                                                                                                                     |
| Spec reference        | 05 Project Metrics — Delivery Rate; ADR 0024                                                                                                                                                                                                                                                                                                                                 |
| Version               | v2 (introduced 2026-10-02, revised 2026-10-03)                                                                                                                                                                                                                                                                                                                               |

#### `projects.milestones_total` — Milestones

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `projects.milestones_total`                                                 |
| Name                  | Milestones                                                                  |
| Category              | projects                                                                    |
| Definition            | Number of milestones recorded, in any status.                               |
| Formula               | `COUNT(milestones)`                                                         |
| Source                | Milestone                                                                   |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS Projects domain (src/modules/projects)                                 |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | count / point_in_time                                                       |
| Availability          | Available                                                                   |
| Drill-down target     | Milestones list (per project: projectId filter)                             |
| Spec reference        | 08 Phase 3 — milestones; 04 Milestone                                       |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `projects.milestones_completed` — Completed milestones

| Field                 | Value                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.milestones_completed`                                                                                             |
| Name                  | Completed milestones                                                                                                        |
| Category              | projects                                                                                                                    |
| Definition            | Number of milestones with status completed (they always have a completion date).                                            |
| Formula               | `COUNT(milestones WHERE status = completed)`                                                                                |
| Source                | Milestone.status                                                                                                            |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                 |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                 |
| Caveats               | Only records owned by the signed-in user are counted. • Current state: counts every completed milestone regardless of when. |
| Value type / temporal | count / point_in_time                                                                                                       |
| Availability          | Available                                                                                                                   |
| Drill-down target     | Milestones list filtered to status=completed                                                                                |
| Spec reference        | 05 Delivery Rate numerator                                                                                                  |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                              |

#### `projects.milestones_completed_in_period` — Milestones completed

| Field                 | Value                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.milestones_completed_in_period`                                                                                 |
| Name                  | Milestones completed                                                                                                      |
| Category              | projects                                                                                                                  |
| Definition            | Number of milestones whose completion date falls inside the selected period.                                              |
| Formula               | `COUNT(milestones WHERE completedAt within period)`                                                                       |
| Source                | Milestone.completedAt                                                                                                     |
| Frequency             | On request — computed live from the database when the Command Center loads.                                               |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                               |
| Caveats               | Only records owned by the signed-in user are counted. • Uses the recorded completion date, never updatedAt or audit time. |
| Value type / temporal | count / period                                                                                                            |
| Availability          | Available                                                                                                                 |
| Drill-down target     | Milestones list filtered to completedFrom/completedTo                                                                     |
| Spec reference        | 00 §4 Momentum; 05 Delivery Rate                                                                                          |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                            |

#### `projects.milestones_overdue` — Overdue milestones

| Field                 | Value                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.milestones_overdue`                                                                                                                                                |
| Name                  | Overdue milestones                                                                                                                                                           |
| Category              | projects                                                                                                                                                                     |
| Definition            | Open milestones (planned, in progress or blocked) whose planned date is before today, in projects that are not archived.                                                     |
| Formula               | `COUNT(milestones WHERE status IN (planned, in_progress, blocked) AND dueDate < today AND project.status <> archived)`                                                       |
| Source                | Milestone.status, Milestone.dueDate, Project.status                                                                                                                          |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                  |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                  |
| Caveats               | Only records owned by the signed-in user are counted. • Today is the current UTC calendar day; a milestone due today is not overdue. • Undated milestones are never overdue. |
| Value type / temporal | count / point_in_time                                                                                                                                                        |
| Availability          | Available                                                                                                                                                                    |
| Drill-down target     | Milestones list filtered to overdue=true                                                                                                                                     |
| Spec reference        | 00 §4 Priority panels — Overdue milestone                                                                                                                                    |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                               |

#### `projects.milestones_blocked` — Blocked milestones

| Field                 | Value                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.milestones_blocked`                                                                                                         |
| Name                  | Blocked milestones                                                                                                                    |
| Category              | projects                                                                                                                              |
| Definition            | Milestones whose status is blocked.                                                                                                   |
| Formula               | `COUNT(milestones WHERE status = blocked)`                                                                                            |
| Source                | Milestone.status                                                                                                                      |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                           |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                           |
| Caveats               | Only records owned by the signed-in user are counted. • Blocked is set manually on the milestone; PEOS has no separate blocker model. |
| Value type / temporal | count / point_in_time                                                                                                                 |
| Availability          | Available                                                                                                                             |
| Drill-down target     | Milestones list filtered to status=blocked                                                                                            |
| Spec reference        | 01 §3 Project Health — blockers; ADR 0024                                                                                             |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                        |

#### `projects.milestone_completion_trend` — Milestone completions over time

| Field                 | Value                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.milestone_completion_trend`                                                                                              |
| Name                  | Milestone completions over time                                                                                                    |
| Category              | projects                                                                                                                           |
| Definition            | Milestones completed per calendar month inside the selected period.                                                                |
| Formula               | `COUNT(milestones) GROUP BY month(completedAt) WHERE completedAt within period`                                                    |
| Source                | Milestone.completedAt                                                                                                              |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                        |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                        |
| Caveats               | Only records owned by the signed-in user are counted. • Months without completions are real zeros. • At most 120 months are shown. |
| Value type / temporal | distribution / period                                                                                                              |
| Availability          | Available                                                                                                                          |
| Drill-down target     | Milestones list filtered to the month's completion dates                                                                           |
| Spec reference        | 05 Delivery Rate; 00 §4 Momentum                                                                                                   |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                     |

#### `projects.delivery_trend` — Project delivery trend

| Field                 | Value                                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.delivery_trend`                                                                                                                                                                                                     |
| Name                  | Project delivery trend                                                                                                                                                                                                        |
| Category              | projects                                                                                                                                                                                                                      |
| Definition            | Projects completed per calendar month inside the selected period.                                                                                                                                                             |
| Formula               | `COUNT(projects) GROUP BY month(completedAt) WHERE completedAt within period`                                                                                                                                                 |
| Source                | Project.completedAt                                                                                                                                                                                                           |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                   |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                                                                   |
| Caveats               | Only records owned by the signed-in user are counted. • Only the recorded completion date is used — never status changes, updatedAt or audit time. • Months without completions are real zeros. At most 120 months are shown. |
| Value type / temporal | distribution / period                                                                                                                                                                                                         |
| Availability          | Available                                                                                                                                                                                                                     |
| Drill-down target     | Projects list filtered to the month's completion dates                                                                                                                                                                        |
| Spec reference        | 00 §4 Required charts — Project delivery trend                                                                                                                                                                                |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                |

#### `projects.health_score` — Computed project health

| Field                 | Value                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.health_score`                                                                                                                                                                                                                                                                                                                      |
| Name                  | Computed project health                                                                                                                                                                                                                                                                                                                      |
| Category              | projects                                                                                                                                                                                                                                                                                                                                     |
| Definition            | Transparent analytical health signal for one project (model project-health-v1): the equal-weight mean of its scored components, with every component explained.                                                                                                                                                                              |
| Formula               | `mean(score of components with state scored); overall only when ≥ 2 components are scored; band: ≥ 75 good, 50–74 needs watching, < 50 poor; archived → not assessed`                                                                                                                                                                        |
| Source                | Project.targetDate, Project.completedAt, Project.status, Milestone, AuditLog (project and milestones)                                                                                                                                                                                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                                                                                                  |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                                                                                                                                                                                  |
| Caveats               | Only records owned by the signed-in user are counted. • Independent of the manual health status, which it never changes (ADR 0023). • Scope stability and issue severity have no data source yet, so every v1 score is partial. • Not persisted: recomputed on request as of today (UTC); no history, so 'declining health' cannot be shown. |
| Value type / temporal | score / point_in_time                                                                                                                                                                                                                                                                                                                        |
| Availability          | Available                                                                                                                                                                                                                                                                                                                                    |
| Drill-down target     | Project dossier, Health section (component breakdown)                                                                                                                                                                                                                                                                                        |
| Spec reference        | 01 §3 Project Health Score; ADR 0024                                                                                                                                                                                                                                                                                                         |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                                                                                                                               |

#### `projects.health_component.schedule` — Health component: schedule

| Field                 | Value                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.health_component.schedule`                                                                                                          |
| Name                  | Health component: schedule                                                                                                                    |
| Category              | projects                                                                                                                                      |
| Definition            | Whether the project meets its target date.                                                                                                    |
| Formula               | `completed: 100 if completedAt ≤ targetDate else 50; open: 100 if targetDate ≥ today else 0; no targetDate → insufficient data`               |
| Source                | Project.targetDate, Project.completedAt                                                                                                       |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                   |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                   |
| Caveats               | Only records owned by the signed-in user are counted. • Uses the project's own dates; milestone dates are covered by the milestone component. |
| Value type / temporal | score / point_in_time                                                                                                                         |
| Availability          | Available                                                                                                                                     |
| Drill-down target     | Project dossier, Health section                                                                                                               |
| Spec reference        | 01 §3 — schedule                                                                                                                              |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                |

#### `projects.health_component.milestones` — Health component: milestone completion

| Field                 | Value                                                                               |
| --------------------- | ----------------------------------------------------------------------------------- |
| Key                   | `projects.health_component.milestones`                                              |
| Name                  | Health component: milestone completion                                              |
| Category              | projects                                                                            |
| Definition            | The project's delivery rate expressed as 0–100.                                     |
| Formula               | `round(100 × delivery rate); no completed or overdue milestone → insufficient data` |
| Source                | Milestone.status, Milestone.dueDate                                                 |
| Frequency             | On request — computed live from the database when the Command Center loads.         |
| Owner                 | PEOS Projects domain (src/modules/projects)                                         |
| Caveats               | Only records owned by the signed-in user are counted.                               |
| Value type / temporal | score / point_in_time                                                               |
| Availability          | Available                                                                           |
| Drill-down target     | Project dossier, Delivery section                                                   |
| Spec reference        | 01 §3 — milestone completion                                                        |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                      |

#### `projects.health_component.blockers` — Health component: blockers

| Field                 | Value                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.health_component.blockers`                                                                                                                                                                    |
| Name                  | Health component: blockers                                                                                                                                                                              |
| Category              | projects                                                                                                                                                                                                |
| Definition            | Whether any open milestone is blocked.                                                                                                                                                                  |
| Formula               | `no open milestones → insufficient data; any blocked → 0; none blocked → 100`                                                                                                                           |
| Source                | Milestone.status                                                                                                                                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                             |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                                             |
| Caveats               | Only records owned by the signed-in user are counted. • Deliberately conservative: one blocked milestone scores 0. • The manual 'Blocked' health status is not read (the two signals stay independent). |
| Value type / temporal | score / point_in_time                                                                                                                                                                                   |
| Availability          | Available                                                                                                                                                                                               |
| Drill-down target     | Milestones list filtered to the project and status=blocked                                                                                                                                              |
| Spec reference        | 01 §3 — blockers                                                                                                                                                                                        |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                          |

#### `projects.health_component.recent_activity` — Health component: recent activity

| Field                 | Value                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.health_component.recent_activity`                                                                                                                                                          |
| Name                  | Health component: recent activity                                                                                                                                                                    |
| Category              | projects                                                                                                                                                                                             |
| Definition            | Whether the project or its milestones changed in PEOS in the last 30 days (active lifecycle stages only).                                                                                            |
| Formula               | `status not in discovery/architecture/development/validation → not applicable; ≥ 1 audit event in 30 days → 100; none → 0`                                                                           |
| Source                | AuditLog (project and milestone events)                                                                                                                                                              |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                          |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                                          |
| Caveats               | Only records owned by the signed-in user are counted. • Measures recorded changes in PEOS, not engineering work done elsewhere. • Presence only — the volume of activity is never treated as health. |
| Value type / temporal | score / point_in_time                                                                                                                                                                                |
| Availability          | Available                                                                                                                                                                                            |
| Drill-down target     | Project dossier, Activity section                                                                                                                                                                    |
| Spec reference        | 01 §3 — recent activity; 05 Project Activity                                                                                                                                                         |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                       |

#### `projects.health_component.scope_stability` — Health component: scope stability

| Field                 | Value                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.health_component.scope_stability`                                                                                       |
| Name                  | Health component: scope stability                                                                                                 |
| Category              | projects                                                                                                                          |
| Definition            | Change in committed scope during a period (spec 05).                                                                              |
| Formula               | `Requires a committed-scope baseline and scope-change history`                                                                    |
| Source                | Committed scope (not modelled)                                                                                                    |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                       |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                       |
| Caveats               | Reported as unavailable in every health breakdown; never estimated.                                                               |
| Value type / temporal | score / period                                                                                                                    |
| Availability          | **Unavailable** — Specification decision required: PEOS does not record a committed-scope baseline; the spec does not define one. |
| Drill-down target     | None                                                                                                                              |
| Spec reference        | 01 §3 — scope stability; 05 Scope Stability                                                                                       |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                    |

#### `projects.health_component.issue_severity` — Health component: issue severity

| Field                 | Value                                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| Key                   | `projects.health_component.issue_severity`                                     |
| Name                  | Health component: issue severity                                               |
| Category              | projects                                                                       |
| Definition            | Severity of open issues affecting the project.                                 |
| Formula               | `Requires an issue data source`                                                |
| Source                | Issues (not modelled; integrations)                                            |
| Frequency             | Per integration sync                                                           |
| Owner                 | PEOS Projects domain (src/modules/projects)                                    |
| Caveats               | 05: do not fabricate metrics when integrations are unavailable.                |
| Value type / temporal | score / point_in_time                                                          |
| Availability          | **Unavailable** — Phase 9 — Engineering Analytics: PEOS has no issue tracking. |
| Drill-down target     | None                                                                           |
| Spec reference        | 01 §3 — issue severity                                                         |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                 |

#### `projects.computed_health_distribution` — Projects by computed health

| Field                 | Value                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.computed_health_distribution`                                                                                                                                                        |
| Name                  | Projects by computed health                                                                                                                                                                    |
| Category              | projects                                                                                                                                                                                       |
| Definition            | Number of projects in each computed health band, plus projects with insufficient data and archived projects (not assessed).                                                                    |
| Formula               | `COUNT(projects) GROUP BY computed band (project-health-v1)`                                                                                                                                   |
| Source                | Computed project health                                                                                                                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                    |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                                    |
| Caveats               | Only records owned by the signed-in user are counted. • Computed on request for every project; not stored. • Not a judgement of the manual assessment — see the manual vs computed comparison. |
| Value type / temporal | distribution / point_in_time                                                                                                                                                                   |
| Availability          | Available                                                                                                                                                                                      |
| Drill-down target     | Computed health list filtered to the band                                                                                                                                                      |
| Spec reference        | 01 §3 Project Health Score; 08 Phase 3 portfolio charts                                                                                                                                        |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                 |

#### `projects.health_comparison` — Manual vs computed health

| Field                 | Value                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.health_comparison`                                                                                                                        |
| Name                  | Manual vs computed health                                                                                                                           |
| Category              | projects                                                                                                                                            |
| Definition            | Projects counted by their manual health status and their computed health band together.                                                             |
| Formula               | `COUNT(projects) GROUP BY (healthStatus, computed band)`                                                                                            |
| Source                | Project.healthStatus, Computed project health                                                                                                       |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                         |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                         |
| Caveats               | Only records owned by the signed-in user are counted. • Describes agreement and disagreement only; neither signal is treated as correct (ADR 0023). |
| Value type / temporal | matrix / point_in_time                                                                                                                              |
| Availability          | Available                                                                                                                                           |
| Drill-down target     | Computed health list filtered to manual status and band                                                                                             |
| Spec reference        | ADR 0023                                                                                                                                            |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                      |

#### `projects.technology_usage` — Technology usage across projects

| Field                 | Value                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.technology_usage`                                                                                                                                                                                                            |
| Name                  | Technology usage across projects                                                                                                                                                                                                       |
| Category              | projects                                                                                                                                                                                                                               |
| Definition            | Number of projects using each technology, split by usage type.                                                                                                                                                                         |
| Formula               | `COUNT(technology_usages) GROUP BY technology, usageType (one row per project–technology)`                                                                                                                                             |
| Source                | TechnologyUsage, Technology                                                                                                                                                                                                            |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                            |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                                                                                                                            |
| Caveats               | Only records owned by the signed-in user are counted. • Shows where a technology was used, not proficiency — no proficiency score is derived. • Top 15 technologies by project count; the rest are summarised as 'Other technologies'. |
| Value type / temporal | distribution / point_in_time                                                                                                                                                                                                           |
| Availability          | Available                                                                                                                                                                                                                              |
| Drill-down target     | Projects list filtered to the technology (technologyId)                                                                                                                                                                                |
| Spec reference        | 08 Phase 3 — technology mapping; 02 'a technology filters projects'                                                                                                                                                                    |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                         |

#### `projects.evidence_coverage` — Project evidence coverage

| Field                 | Value                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `projects.evidence_coverage`                                                                                                   |
| Name                  | Project evidence coverage                                                                                                      |
| Category              | projects                                                                                                                       |
| Definition            | Projects with at least one linked evidence item, and projects without any.                                                     |
| Formula               | `COUNT(projects WITH ≥ 1 project_evidence), COUNT(projects WITHOUT)`                                                           |
| Source                | ProjectEvidence                                                                                                                |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                    |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                                    |
| Caveats               | Only records owned by the signed-in user are counted. • Counts links, not evidence quality; verification is shown per project. |
| Value type / temporal | distribution / point_in_time                                                                                                   |
| Availability          | Available                                                                                                                      |
| Drill-down target     | Projects list filtered to hasEvidence=true / false                                                                             |
| Spec reference        | 08 Phase 3 — project evidence                                                                                                  |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                 |

#### `projects.evidence_linked` — Project evidence

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `projects.evidence_linked`                                                  |
| Name                  | Project evidence                                                            |
| Category              | projects                                                                    |
| Definition            | Evidence items linked to one project.                                       |
| Formula               | `COUNT(evidence WHERE linked to the project)`                               |
| Source                | ProjectEvidence, Evidence                                                   |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS Projects domain (src/modules/projects)                                 |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | count / point_in_time                                                       |
| Availability          | Available                                                                   |
| Drill-down target     | Evidence list filtered to the project (projectId)                           |
| Spec reference        | 08 Phase 3 — project evidence                                               |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `projects.evidence_verified` — Verified project evidence

| Field                 | Value                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.evidence_verified`                                                                            |
| Name                  | Verified project evidence                                                                               |
| Category              | projects                                                                                                |
| Definition            | Verified evidence items linked to one project.                                                          |
| Formula               | `COUNT(evidence WHERE linked to the project AND verified)`                                              |
| Source                | ProjectEvidence, Evidence.verified                                                                      |
| Frequency             | On request — computed live from the database when the Command Center loads.                             |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                             |
| Caveats               | Only records owned by the signed-in user are counted. • Verification is recorded by the user (Phase 1). |
| Value type / temporal | count / point_in_time                                                                                   |
| Availability          | Available                                                                                               |
| Drill-down target     | Evidence list filtered to the project and verified=true                                                 |
| Spec reference        | 08 Phase 3 — project evidence                                                                           |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                          |

#### `projects.evidence_by_type` — Project evidence by type

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `projects.evidence_by_type`                                                 |
| Name                  | Project evidence by type                                                    |
| Category              | projects                                                                    |
| Definition            | Evidence items linked to one project, per evidence type.                    |
| Formula               | `COUNT(evidence WHERE linked to the project) GROUP BY type`                 |
| Source                | ProjectEvidence, Evidence.type                                              |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS Projects domain (src/modules/projects)                                 |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | distribution / point_in_time                                                |
| Availability          | Available                                                                   |
| Drill-down target     | Evidence list filtered to the project and type                              |
| Spec reference        | 08 Phase 3 — project evidence                                               |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `projects.blocked_time` — Blocked time

| Field                 | Value                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `projects.blocked_time`                                                                                                  |
| Name                  | Blocked time                                                                                                             |
| Category              | projects                                                                                                                 |
| Definition            | Time projects remain blocked (spec 05).                                                                                  |
| Formula               | `Requires the history of status changes`                                                                                 |
| Source                | Status history (not recorded)                                                                                            |
| Frequency             | On request — computed live from the database when the Command Center loads.                                              |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                              |
| Caveats               | Never reconstructed from the audit log retroactively.                                                                    |
| Value type / temporal | count / period                                                                                                           |
| Availability          | **Unavailable** — Specification decision required: PEOS records only the current status, not when it changed (ADR 0025). |
| Drill-down target     | None                                                                                                                     |
| Spec reference        | 05 Project Metrics — Blocked Time                                                                                        |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                           |

#### `projects.portfolio_matrix` — Project portfolio matrix

| Field                 | Value                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Key                   | `projects.portfolio_matrix`                                                                                        |
| Name                  | Project portfolio matrix                                                                                           |
| Category              | projects                                                                                                           |
| Definition            | Impact × technical complexity, bubble size = effort (spec 05).                                                     |
| Formula               | `Requires numeric impact, complexity and effort`                                                                   |
| Source                | Project impact/complexity/effort (not modelled)                                                                    |
| Frequency             | On request — computed live from the database when the Command Center loads.                                        |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                        |
| Caveats               | Project.impact is free text; complexity and effort do not exist in spec 04.                                        |
| Value type / temporal | matrix / point_in_time                                                                                             |
| Availability          | **Unavailable** — Specification decision required: Spec 04 defines no numeric impact, complexity or effort fields. |
| Drill-down target     | None                                                                                                               |
| Spec reference        | 05 Visualization Catalog — Project Portfolio Matrix                                                                |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                     |

#### `projects.technology_heatmap` — Technology heatmap

| Field                 | Value                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Key                   | `projects.technology_heatmap`                                                                                           |
| Name                  | Technology heatmap                                                                                                      |
| Category              | projects                                                                                                                |
| Definition            | Technologies × months, cell = meaningful usage (spec 05).                                                               |
| Formula               | `Requires dated technology usage`                                                                                       |
| Source                | TechnologyUsage (undated)                                                                                               |
| Frequency             | On request — computed live from the database when the Command Center loads.                                             |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                             |
| Caveats               | Usage months are never inferred from project dates.                                                                     |
| Value type / temporal | matrix / period                                                                                                         |
| Availability          | **Unavailable** — Specification decision required: Technology usage has no dates; spec 04 TechnologyUsage defines none. |
| Drill-down target     | None                                                                                                                    |
| Spec reference        | 05 Technology Heatmap; 00 §4 Technology usage heatmap                                                                   |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                          |

#### `evidence.total` — Evidence items

| Field                 | Value                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Key                   | `evidence.total`                                                                                       |
| Name                  | Evidence items                                                                                         |
| Category              | evidence                                                                                               |
| Definition            | Number of evidence records, dated or not.                                                              |
| Formula               | `COUNT(evidence) where type/verified/origin match the dashboard evidence filters`                      |
| Source                | Evidence                                                                                               |
| Frequency             | On request — computed live from the database when the Command Center loads.                            |
| Owner                 | PEOS Evidence domain (src/modules/evidence)                                                            |
| Caveats               | Only records owned by the signed-in user are counted. • Counts records, not their quality or strength. |
| Value type / temporal | count / point_in_time                                                                                  |
| Availability          | Available                                                                                              |
| Drill-down target     | Evidence list with the same filters                                                                    |
| Spec reference        | 00 §4 KPI strip — Evidence Items                                                                       |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                         |

#### `evidence.verified` — Verified evidence

| Field                 | Value                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `evidence.verified`                                                                                                                       |
| Name                  | Verified evidence                                                                                                                         |
| Category              | evidence                                                                                                                                  |
| Definition            | Evidence records you marked as verified against their source.                                                                             |
| Formula               | `COUNT(evidence WHERE verified = true)`                                                                                                   |
| Source                | Evidence.verified                                                                                                                         |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                               |
| Owner                 | PEOS Evidence domain (src/modules/evidence)                                                                                               |
| Caveats               | Only records owned by the signed-in user are counted. • Verification is a manual confirmation; PEOS does not check sources automatically. |
| Value type / temporal | count / point_in_time                                                                                                                     |
| Availability          | Available                                                                                                                                 |
| Drill-down target     | Evidence list filtered to verified                                                                                                        |
| Spec reference        | 05 Career Metrics — Evidence Velocity (verified evidence)                                                                                 |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                            |

#### `evidence.velocity` — Evidence velocity

| Field                 | Value                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `evidence.velocity`                                                                                                                                                                                                                                                                                                                                                                                                        |
| Name                  | Evidence velocity                                                                                                                                                                                                                                                                                                                                                                                                          |
| Category              | evidence                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Definition            | Verified evidence items whose evidence date falls within the selected period (verified evidence per period).                                                                                                                                                                                                                                                                                                               |
| Formula               | `COUNT(evidence WHERE verified = true AND date BETWEEN period.start AND period.end); previous period = the same number of days immediately before`                                                                                                                                                                                                                                                                         |
| Source                | Evidence.verified, Evidence.date                                                                                                                                                                                                                                                                                                                                                                                           |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                                                                                                                                                                                |
| Owner                 | PEOS Evidence domain (src/modules/evidence)                                                                                                                                                                                                                                                                                                                                                                                |
| Caveats               | Only records owned by the signed-in user are counted. • Uses the evidence date you recorded, not the day it was entered in PEOS. • Verification is current state: an item verified today counts in the period of its evidence date. • Undated evidence is excluded and reported separately. • A previous-period comparison is shown only for bounded periods and only when dated evidence exists before the period starts. |
| Value type / temporal | count / period                                                                                                                                                                                                                                                                                                                                                                                                             |
| Availability          | Available                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Drill-down target     | Evidence list filtered to verified items dated in the period                                                                                                                                                                                                                                                                                                                                                               |
| Spec reference        | 05 Career Metrics — Evidence Velocity                                                                                                                                                                                                                                                                                                                                                                                      |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                                                                                                                                                                                                                                                                                                             |

#### `evidence.undated` — Undated evidence

| Field                 | Value                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Key                   | `evidence.undated`                                                                                |
| Name                  | Undated evidence                                                                                  |
| Category              | evidence                                                                                          |
| Definition            | Evidence records without an evidence date. They cannot appear on the timeline.                    |
| Formula               | `COUNT(evidence WHERE date IS NULL)`                                                              |
| Source                | Evidence.date                                                                                     |
| Frequency             | On request — computed live from the database when the Command Center loads.                       |
| Owner                 | PEOS Evidence domain (src/modules/evidence)                                                       |
| Caveats               | Only records owned by the signed-in user are counted. • PEOS never assigns a date on your behalf. |
| Value type / temporal | count / point_in_time                                                                             |
| Availability          | Available                                                                                         |
| Drill-down target     | Evidence list filtered to undated items                                                           |
| Spec reference        | 00 §6 — missing data must be explicit                                                             |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                    |

#### `skills.total` — Skills

| Field                 | Value                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.total`                                                                                          |
| Name                  | Skills                                                                                                  |
| Category              | skills                                                                                                  |
| Definition            | Number of skills recorded.                                                                              |
| Formula               | `COUNT(skills) where category matches the dashboard skill filter`                                       |
| Source                | Skill                                                                                                   |
| Frequency             | On request — computed live from the database when the Command Center loads.                             |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                 |
| Caveats               | Only records owned by the signed-in user are counted. • A recorded skill is not a claim of proficiency. |
| Value type / temporal | count / point_in_time                                                                                   |
| Availability          | Available                                                                                               |
| Drill-down target     | Skills list                                                                                             |
| Spec reference        | 08 Phase 2 — skill snapshot                                                                             |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                          |

#### `skills.active` — Active skills

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `skills.active`                                                             |
| Name                  | Active skills                                                               |
| Category              | skills                                                                      |
| Definition            | Skills marked active (ones you are currently tracking).                     |
| Formula               | `COUNT(skills WHERE active = true)`                                         |
| Source                | Skill.active                                                                |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS Skills domain (src/modules/skills)                                     |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | count / point_in_time                                                       |
| Availability          | Available                                                                   |
| Drill-down target     | Skills list filtered to active                                              |
| Spec reference        | 04 Skill.active                                                             |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                              |

#### `skills.with_target` — Skills with a target level

| Field                 | Value                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.with_target`                                                                                                                                |
| Name                  | Skills with a target level                                                                                                                          |
| Category              | skills                                                                                                                                              |
| Definition            | Skills for which you set a target level.                                                                                                            |
| Formula               | `COUNT(skills WHERE target_level IS NOT NULL)`                                                                                                      |
| Source                | Skill.targetLevel                                                                                                                                   |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                         |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                                                             |
| Caveats               | Only records owned by the signed-in user are counted. • Targets are goals, not current levels. Current levels are derived from evidence in Phase 4. |
| Value type / temporal | count / point_in_time                                                                                                                               |
| Availability          | Available                                                                                                                                           |
| Drill-down target     | Skills list filtered to skills with a target                                                                                                        |
| Spec reference        | 04 Skill.targetLevel                                                                                                                                |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                                      |

#### `skills.with_evidence` — Skills with evidence

| Field                 | Value                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.with_evidence`                                                                                                                                                                                                |
| Name                  | Skills with evidence                                                                                                                                                                                                  |
| Category              | skills                                                                                                                                                                                                                |
| Definition            | Skills linked to at least one evidence item.                                                                                                                                                                          |
| Formula               | `COUNT(skills WHERE EXISTS skill_evidence)`                                                                                                                                                                           |
| Source                | Skill, SkillEvidence                                                                                                                                                                                                  |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                           |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                                                                                                                               |
| Caveats               | Only records owned by the signed-in user are counted. • Counts the existence of a link only — not its strength, recency or verification. It is NOT the spec's “Skill Coverage” (which needs a recency rule, Phase 4). |
| Value type / temporal | count / point_in_time                                                                                                                                                                                                 |
| Availability          | Available                                                                                                                                                                                                             |
| Drill-down target     | Skills list filtered to skills with evidence                                                                                                                                                                          |
| Spec reference        | 08 Phase 2 — skill snapshot; 00 §2.1 evidence over self-assessment                                                                                                                                                    |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                                                                                                        |

#### `skills.without_evidence` — Active skills without evidence

| Field                 | Value                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.without_evidence`                                                                                     |
| Name                  | Active skills without evidence                                                                                |
| Category              | skills                                                                                                        |
| Definition            | Active skills that have no linked evidence yet.                                                               |
| Formula               | `COUNT(skills WHERE active = true AND NOT EXISTS skill_evidence)`                                             |
| Source                | Skill.active, SkillEvidence                                                                                   |
| Frequency             | On request — computed live from the database when the Command Center loads.                                   |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                       |
| Caveats               | Only records owned by the signed-in user are counted. • Indicates missing documentation, not missing ability. |
| Value type / temporal | count / point_in_time                                                                                         |
| Availability          | Available                                                                                                     |
| Drill-down target     | Skills list filtered to active skills without evidence                                                        |
| Spec reference        | 01 §2 Career Evidence; 00 §4 “What evidence did I create?”                                                    |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                |

#### `skills.by_category` — Skills by category

| Field                 | Value                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.by_category`                                                                                                  |
| Name                  | Skills by category                                                                                                    |
| Category              | skills                                                                                                                |
| Definition            | Number of skills in each category you assigned (uncategorised shown explicitly).                                      |
| Formula               | `COUNT(skills) GROUP BY category`                                                                                     |
| Source                | Skill.category                                                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads.                                           |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                               |
| Caveats               | Only records owned by the signed-in user are counted. • Categories are free text; spelling variants count separately. |
| Value type / temporal | distribution / point_in_time                                                                                          |
| Availability          | Available                                                                                                             |
| Drill-down target     | Skills list filtered to the selected category                                                                         |
| Spec reference        | 01 §6 Skill Registry — Category                                                                                       |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                        |

#### `certifications.total` — Certifications

| Field                 | Value                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `certifications.total`                                                                                                            |
| Name                  | Certifications                                                                                                                    |
| Category              | certifications                                                                                                                    |
| Definition            | Number of certifications recorded, in any status.                                                                                 |
| Formula               | `COUNT(certifications)`                                                                                                           |
| Source                | Certification                                                                                                                     |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                       |
| Owner                 | PEOS Certifications domain (src/modules/certifications)                                                                           |
| Caveats               | Only records owned by the signed-in user are counted. • Certifications are evidence, not proof of production proficiency (01 §7). |
| Value type / temporal | count / point_in_time                                                                                                             |
| Availability          | Available                                                                                                                         |
| Drill-down target     | Certifications list                                                                                                               |
| Spec reference        | 01 §7 Certifications                                                                                                              |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                    |

#### `certifications.expiry_distribution` — Certification expiry

| Field                 | Value                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `certifications.expiry_distribution`                                                                                                         |
| Name                  | Certification expiry                                                                                                                         |
| Category              | certifications                                                                                                                               |
| Definition            | Certifications by expiry state: Valid, Expiring within 90 days, Expired, No expiry date. Revoked certifications are excluded.                |
| Formula               | `COUNT(certifications WHERE status <> revoked) GROUP BY expiryState(expiry_date, today) — same rule as the certification list`               |
| Source                | Certification.expiryDate, Certification.status                                                                                               |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                  |
| Owner                 | PEOS Certifications domain (src/modules/certifications)                                                                                      |
| Caveats               | Only records owned by the signed-in user are counted. • Today is the current UTC date. • Uses the 90-day expiring window defined in Phase 1. |
| Value type / temporal | distribution / point_in_time                                                                                                                 |
| Availability          | Available                                                                                                                                    |
| Drill-down target     | Certifications list filtered to the selected expiry state                                                                                    |
| Spec reference        | 01 §7 — expiring certifications chart                                                                                                        |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                               |

#### `certifications.expiring` — Certifications expiring

| Field                 | Value                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Key                   | `certifications.expiring`                                                                                              |
| Name                  | Certifications expiring                                                                                                |
| Category              | certifications                                                                                                         |
| Definition            | Non-revoked certifications that expire within the next 90 days.                                                        |
| Formula               | `COUNT(certifications WHERE status <> revoked AND expiry_date BETWEEN today AND today + 90 days)`                      |
| Source                | Certification.expiryDate, Certification.status                                                                         |
| Frequency             | On request — computed live from the database when the Command Center loads.                                            |
| Owner                 | PEOS Certifications domain (src/modules/certifications)                                                                |
| Caveats               | Only records owned by the signed-in user are counted. • Certifications without an expiry date never count as expiring. |
| Value type / temporal | count / point_in_time                                                                                                  |
| Availability          | Available                                                                                                              |
| Drill-down target     | Certifications list filtered to expiring                                                                               |
| Spec reference        | 00 §4 Attention — Certification expiring                                                                               |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                         |

#### `goals.active` — Active goals

| Field                 | Value                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Key                   | `goals.active`                                                                                  |
| Name                  | Active goals                                                                                    |
| Category              | goals                                                                                           |
| Definition            | Goals currently in progress.                                                                    |
| Formula               | `COUNT(goals WHERE status = active)`                                                            |
| Source                | Goal (not yet modelled)                                                                         |
| Frequency             | On request — computed live from the database when the Command Center loads.                     |
| Owner                 | PEOS Goals domain (Phase 5)                                                                     |
| Caveats               | Goals do not exist yet.                                                                         |
| Value type / temporal | count / point_in_time                                                                           |
| Availability          | **Unavailable** — Phase 5 — Goals & Roadmap: The Goal entity is not part of the data model yet. |
| Drill-down target     | None                                                                                            |
| Spec reference        | 00 §4 KPI strip — Active Goals                                                                  |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                  |

#### `skills.coverage` — Skill coverage

| Field                 | Value                                                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.coverage`                                                                                                                                                                                                                                                |
| Name                  | Skill coverage                                                                                                                                                                                                                                                   |
| Category              | skills                                                                                                                                                                                                                                                           |
| Definition            | Share of active target skills (target level ≥ 1) whose latest dated demonstration is fresh (≤ 365 days).                                                                                                                                                         |
| Formula               | `COUNT(active skills WITH target ≥ 1 AND freshness = fresh) / COUNT(active skills WITH target ≥ 1); freshness-v1`                                                                                                                                                |
| Source                | Skill.targetLevel, Skill.active, SkillEvidence.date, Evidence.date                                                                                                                                                                                               |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                      |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                                                                                                                                                                          |
| Caveats               | Only records owned by the signed-in user are counted. • “Recent” = fresh under freshness-v1 (ADR 0028): last demonstration within 365 days (UTC days). • No active target skill → insufficient data, never 0%. • Describes recency of evidence, not proficiency. |
| Value type / temporal | ratio / point_in_time                                                                                                                                                                                                                                            |
| Availability          | Available                                                                                                                                                                                                                                                        |
| Drill-down target     | Skill intelligence list: active, with target, freshness = fresh (numerator)                                                                                                                                                                                      |
| Spec reference        | 05 Career Metrics — Skill Coverage; 00 §4 KPI strip                                                                                                                                                                                                              |
| Version               | v2 (introduced 2026-10-02, revised 2026-10-03)                                                                                                                                                                                                                   |

#### `skills.critical_gaps` — Critical skill gaps

| Field                 | Value                                                                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.critical_gaps`                                                                                                                                                                                                                              |
| Name                  | Critical skill gaps                                                                                                                                                                                                                                 |
| Category              | skills                                                                                                                                                                                                                                              |
| Definition            | Active target skills whose evidence-derived level is at least 2 below target, or below target with stale evidence.                                                                                                                                  |
| Formula               | `COUNT(active skills WHERE target ≥ 1 AND derived level exists AND (target − level ≥ 2 OR (target − level ≥ 1 AND freshness = stale))); gap-analysis-v1`                                                                                            |
| Source                | Skill.targetLevel, Derived skill level (skill-level-v1), Skill freshness (freshness-v1)                                                                                                                                                             |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                         |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                                                                                                                                                             |
| Caveats               | Only records owned by the signed-in user are counted. • Skills without evidence are never critical; they are counted as “targets without evidence”. • The definition is a PEOS convention (ADR 0029); the specification does not define “critical”. |
| Value type / temporal | count / point_in_time                                                                                                                                                                                                                               |
| Availability          | Available                                                                                                                                                                                                                                           |
| Drill-down target     | Skill intelligence list filtered to critical=true                                                                                                                                                                                                   |
| Spec reference        | 00 §4 KPI strip — Critical Skill Gaps; ADR 0029                                                                                                                                                                                                     |
| Version               | v2 (introduced 2026-10-02, revised 2026-10-03)                                                                                                                                                                                                      |

#### `skills.freshness` — Skill freshness

| Field                 | Value                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `skills.freshness`                                                                                                                                                                                                                                                                                     |
| Name                  | Skill freshness                                                                                                                                                                                                                                                                                        |
| Category              | skills                                                                                                                                                                                                                                                                                                 |
| Definition            | Active skills by recency of their latest dated demonstration: fresh, aging, stale, no dated evidence, no evidence.                                                                                                                                                                                     |
| Formula               | `days = today − MAX(COALESCE(SkillEvidence.date, Evidence.date)) over demonstrations ≤ today; fresh ≤ 365, aging ≤ 730, stale > 730`                                                                                                                                                                   |
| Source                | SkillEvidence.date, Evidence.date                                                                                                                                                                                                                                                                      |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                                                            |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                                                                                                                                                                                                                |
| Caveats               | Only records owned by the signed-in user are counted. • Never uses updatedAt, import time or audit time. Undated evidence counts as evidence but never establishes recency. • Future-dated demonstrations are ignored until their date arrives. • A descriptive signal, not a judgement of competence. |
| Value type / temporal | distribution / point_in_time                                                                                                                                                                                                                                                                           |
| Availability          | Available                                                                                                                                                                                                                                                                                              |
| Drill-down target     | Skill intelligence list filtered to the freshness state                                                                                                                                                                                                                                                |
| Spec reference        | 05 Career Metrics — Skill Freshness; ADR 0028                                                                                                                                                                                                                                                          |
| Version               | v2 (introduced 2026-10-02, revised 2026-10-03)                                                                                                                                                                                                                                                         |

#### `skills.current_level` — Evidence-derived skill level

| Field                 | Value                                                                                                                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.current_level`                                                                                                                                                                                                                                                                                               |
| Name                  | Evidence-derived skill level                                                                                                                                                                                                                                                                                         |
| Category              | skills                                                                                                                                                                                                                                                                                                               |
| Definition            | The highest level of the canonical 0–5 ladder whose evidence rules (and all lower rules) hold for one skill (skill-level-v1).                                                                                                                                                                                        |
| Formula               | `L1 any record; L2 moderate/strong evidence OR delivered project OR earned certification; L3 ≥2 moderate/strong (≥1 verified) AND delivered project; L4 ≥3 (≥2 verified, ≥1 strong) AND production-linked; L5 ≥5 (≥3 verified, ≥2 strong verified), ≥2 production-linked AND verified testimonial/publication`       |
| Source                | SkillEvidence, Evidence, ProjectSkill, Project.status, CertificationSkill, Certification.status                                                                                                                                                                                                                      |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                                                                          |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                                                                                                                                                                                                                              |
| Caveats               | Only records owned by the signed-in user are counted. • Never self-assessed and never stored; recomputed from linked records on request. • No linked record → “Not enough evidence” (null), never level 0. • Certification or project links alone cap at level 2. Evidence strength is set by the user when linking. |
| Value type / temporal | score / point_in_time                                                                                                                                                                                                                                                                                                |
| Availability          | Available                                                                                                                                                                                                                                                                                                            |
| Drill-down target     | Skill dossier (rule-by-rule breakdown)                                                                                                                                                                                                                                                                               |
| Spec reference        | 08 Phase 4 — skill levels; 00 §2.1; ADR 0027                                                                                                                                                                                                                                                                         |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                                                                                                       |

#### `skills.level_distribution` — Skills by derived level

| Field                 | Value                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.level_distribution`                                                                                   |
| Name                  | Skills by derived level                                                                                       |
| Category              | skills                                                                                                        |
| Definition            | Active skills per evidence-derived level, plus skills without a derivable level.                              |
| Formula               | `COUNT(active skills) GROUP BY derived level (1–5                                                             | none); skill-level-v1` |
| Source                | Derived skill level (skill-level-v1)                                                                          |
| Frequency             | On request — computed live from the database when the Command Center loads.                                   |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                       |
| Caveats               | Only records owned by the signed-in user are counted. • “None” means not enough evidence — it is not level 0. |
| Value type / temporal | distribution / point_in_time                                                                                  |
| Availability          | Available                                                                                                     |
| Drill-down target     | Skill intelligence list filtered to the level                                                                 |
| Spec reference        | 05 Skill Radar (capability profile); ADR 0027                                                                 |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                |

#### `skills.gap_distribution` — Skills by gap state

| Field                 | Value                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.gap_distribution`                                                                                            |
| Name                  | Skills by gap state                                                                                                  |
| Category              | skills                                                                                                               |
| Definition            | Active skills below, at or above target, with a target but no derivable level (not computable), or without a target. |
| Formula               | `COUNT(active skills) GROUP BY gap state; gap-analysis-v1`                                                           |
| Source                | Skill.targetLevel, Derived skill level (skill-level-v1)                                                              |
| Frequency             | On request — computed live from the database when the Command Center loads.                                          |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                              |
| Caveats               | Only records owned by the signed-in user are counted. • Target 0 (“not evaluated”) counts as no target.              |
| Value type / temporal | distribution / point_in_time                                                                                         |
| Availability          | Available                                                                                                            |
| Drill-down target     | Skill intelligence list filtered to the gap state                                                                    |
| Spec reference        | 08 Phase 4 — skill gap analysis; 05 Skill Gap Heatmap                                                                |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                       |

#### `skills.targets_without_evidence` — Targets without evidence

| Field                 | Value                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Key                   | `skills.targets_without_evidence`                                                                   |
| Name                  | Targets without evidence                                                                            |
| Category              | skills                                                                                              |
| Definition            | Active skills with a target level but no derivable level.                                           |
| Formula               | `COUNT(active skills WHERE target ≥ 1 AND derived level IS NULL)`                                   |
| Source                | Skill.targetLevel, Derived skill level (skill-level-v1)                                             |
| Frequency             | On request — computed live from the database when the Command Center loads.                         |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                             |
| Caveats               | Only records owned by the signed-in user are counted. • Missing evidence — not a measured weakness. |
| Value type / temporal | count / point_in_time                                                                               |
| Availability          | Available                                                                                           |
| Drill-down target     | Skill intelligence list filtered to targetWithoutEvidence=true                                      |
| Spec reference        | ADR 0029                                                                                            |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                      |

#### `skills.growth` — Skill demonstration trend

| Field                 | Value                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `skills.growth`                                                                                                                                                                            |
| Name                  | Skill demonstration trend                                                                                                                                                                  |
| Category              | skills                                                                                                                                                                                     |
| Definition            | Active skills by demonstration activity: more, as many, or fewer dated demonstrations in the last 12 months than in the 12 before; or insufficient history.                                |
| Formula               | `A = dated demonstrations in [today−364, today]; B = in the 365 days before; insufficient if < 2 dated or none before A; else A>B increasing, A=B stable, A<B decreasing (skill-trend-v1)` |
| Source                | SkillEvidence.date, Evidence.date                                                                                                                                                          |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                                                                                                    |
| Caveats               | Only records owned by the signed-in user are counted. • Describes activity, not proficiency; no historical level is interpolated or reconstructed.                                         |
| Value type / temporal | distribution / point_in_time                                                                                                                                                               |
| Availability          | Available                                                                                                                                                                                  |
| Drill-down target     | Skill intelligence list filtered to the trend state                                                                                                                                        |
| Spec reference        | 10 Skills — Historical trend; 05 Career Metrics; ADR 0028                                                                                                                                  |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                             |

#### `skills.production_evidence` — Skills with production evidence

| Field                 | Value                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.production_evidence`                                                                                        |
| Name                  | Skills with production evidence                                                                                     |
| Category              | skills                                                                                                              |
| Definition            | Active skills linked to at least one production-stage project or a moderate/strong production-metric evidence item. |
| Formula               | `COUNT(active skills WHERE linked projects in production/maintenance + qualifying production_metric evidence ≥ 1)`  |
| Source                | ProjectSkill, Project.status, SkillEvidence, Evidence.type                                                          |
| Frequency             | On request — computed live from the database when the Command Center loads.                                         |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                             |
| Caveats               | Only records owned by the signed-in user are counted. • Project status is maintained manually (ADR 0018).           |
| Value type / temporal | count / point_in_time                                                                                               |
| Availability          | Available                                                                                                           |
| Drill-down target     | Skill intelligence list filtered to productionLinked=true                                                           |
| Spec reference        | 05 Skill Gap Heatmap — production evidence column                                                                   |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                      |

#### `skills.radar` — Skill radar

| Field                 | Value                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.radar`                                                                                                                     |
| Name                  | Skill radar                                                                                                                        |
| Category              | skills                                                                                                                             |
| Definition            | Capability profile: evidence-derived level and target for up to 12 active skills that have a derived level.                        |
| Formula               | `Skills with a derived level, target skills first, then by level and name; skills without a derived level are listed, not plotted` |
| Source                | Derived skill level (skill-level-v1), Skill.targetLevel                                                                            |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                        |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                                            |
| Caveats               | Only records owned by the signed-in user are counted. • A missing level is never plotted as 0.                                     |
| Value type / temporal | score / point_in_time                                                                                                              |
| Availability          | Available                                                                                                                          |
| Drill-down target     | Skill dossier per axis; skill intelligence list                                                                                    |
| Spec reference        | 05 Visualization Catalog — Skill Radar                                                                                             |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                     |

#### `skills.learning_velocity` — Learning velocity

| Field                 | Value                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.learning_velocity`                                                                                            |
| Name                  | Learning velocity                                                                                                     |
| Category              | skills                                                                                                                |
| Definition            | Learning hours, completed learning items and learning-to-evidence conversion (05 Learning Metrics).                   |
| Formula               | `Requires LearningItem records`                                                                                       |
| Source                | LearningItem (not modelled)                                                                                           |
| Frequency             | On request — computed live from the database when the Command Center loads.                                           |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                               |
| Caveats               | Never estimated from evidence or activity.                                                                            |
| Value type / temporal | count / period                                                                                                        |
| Availability          | **Unavailable** — Specification decision required: The Knowledge/LearningItem domain is not scheduled in 08 (gap C4). |
| Drill-down target     | None                                                                                                                  |
| Spec reference        | 05 Learning Metrics; 00 §4 Learning velocity                                                                          |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                        |

#### `evidence.production_ratio` — Production evidence ratio

| Field                 | Value                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `evidence.production_ratio`                                                                                                                                                               |
| Name                  | Production evidence ratio                                                                                                                                                                 |
| Category              | evidence                                                                                                                                                                                  |
| Definition            | Production-linked evidence divided by total evidence.                                                                                                                                     |
| Formula               | `COUNT(production-linked evidence) / COUNT(evidence)`                                                                                                                                     |
| Source                | Evidence                                                                                                                                                                                  |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                               |
| Owner                 | PEOS Evidence domain (src/modules/evidence)                                                                                                                                               |
| Caveats               | Descriptive indicator, not a quality judgment (05).                                                                                                                                       |
| Value type / temporal | count / point_in_time                                                                                                                                                                     |
| Availability          | **Unavailable** — Specification decision required: “Production-linked” is not defined (evidence type production_metric? linked to a production project?). Needs a specification decision. |
| Drill-down target     | None                                                                                                                                                                                      |
| Spec reference        | 05 Career Metrics — Production Evidence Ratio                                                                                                                                             |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                                                                            |

#### `ai.experiments` — AI experiments

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `ai.experiments`                                                            |
| Name                  | AI experiments                                                              |
| Category              | ai                                                                          |
| Definition            | Number of AI experiments recorded.                                          |
| Formula               | `COUNT(ai_experiments)`                                                     |
| Source                | AIExperiment (not yet modelled)                                             |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS AI Lab domain (Phase 6)                                                |
| Caveats               | AI experiments do not exist yet.                                            |
| Value type / temporal | count / point_in_time                                                       |
| Availability          | **Unavailable** — Phase 6 — AI Lab: The AI Lab is not built yet.            |
| Drill-down target     | None                                                                        |
| Spec reference        | 00 §4 KPI strip — AI Experiments                                            |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                              |

#### `architecture.decisions` — Architecture decisions

| Field                 | Value                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.decisions`                                                                           |
| Name                  | Architecture decisions                                                                             |
| Category              | architecture                                                                                       |
| Definition            | Number of architecture decision records.                                                           |
| Formula               | `COUNT(architecture_decisions)`                                                                    |
| Source                | ArchitectureDecision (not yet modelled)                                                            |
| Frequency             | On request — computed live from the database when the Command Center loads.                        |
| Owner                 | PEOS Architecture domain (Phase 7)                                                                 |
| Caveats               | ADRs inside PEOS do not exist yet.                                                                 |
| Value type / temporal | count / point_in_time                                                                              |
| Availability          | **Unavailable** — Phase 7 — Architecture Intelligence: Architecture Intelligence is not built yet. |
| Drill-down target     | None                                                                                               |
| Spec reference        | 00 §4 KPI strip — Architecture Decisions                                                           |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                     |

#### `engineering.technical_debt_trend` — Technical debt trend

| Field                 | Value                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Key                   | `engineering.technical_debt_trend`                                                        |
| Name                  | Technical debt trend                                                                      |
| Category              | engineering                                                                               |
| Definition            | Change in recorded technical debt over time.                                              |
| Formula               | `Requires an engineering data source`                                                     |
| Source                | Integrations (not yet built)                                                              |
| Frequency             | Per integration sync                                                                      |
| Owner                 | PEOS Engineering Analytics (Phase 9)                                                      |
| Caveats               | 05: do not fabricate metrics when integrations are unavailable.                           |
| Value type / temporal | count / period                                                                            |
| Availability          | **Unavailable** — Phase 9 — Engineering Analytics: No engineering integration exists yet. |
| Drill-down target     | None                                                                                      |
| Spec reference        | 00 §4 KPI strip — Technical Debt Trend                                                    |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                            |
