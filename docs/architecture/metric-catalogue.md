# PEOS Metric Catalogue (Phases 2–9.6)

Generated from `src/modules/analytics/metric-catalogue.ts`, which is the source of truth (ADR 0019).
The catalogue is validated by a strict Zod schema when it is loaded, served read-only at
`GET /api/v1/analytics/metrics`, and shown in the app at `/command-center/metrics` and in each
metric's definition drawer.

- **118 metrics**: 106 available, 12 unavailable (each with its reason and the phase or decision
  that unlocks it).
- Phase 3 adds milestone, delivery, computed-health, portfolio, technology and project-evidence
  metrics (ADRs 0022–0025). `projects.delivery_rate` is now available (version 2).
- Phase 4 adds evidence-derived skill metrics (`skill-level-v1`, `freshness-v1`, `skill-trend-v1`,
  `gap-analysis-v1`) and makes skill coverage, critical gaps and freshness available (version 2;
  ADRs 0026–0030). Learning velocity stays unavailable.
- Phase 5 adds 16 goal metrics (status, risk, overdue, completion rate, target attainment,
  coverage, deadline load, milestone progress, burndown; `goal-lifecycle-v1`,
  `goal-attainment-v1`, `goal-risk-v1`) and makes `goals.active` available (version 2; ADRs
  0031–0035). No composite goal progress score exists.
- Phase 6 adds 13 AI Lab metrics (status, decision, category, reproducibility, adoption rate,
  evaluation coverage, missing-evaluation/provenance, runs, per-month) and makes `ai.experiments`
  available (version 2; ADRs 0036–0040). No opaque "AI score"; cost/latency/token summaries are
  descriptive, not governed KPIs.
- Phase 7 adds 12 architecture metrics (in force, status, revisit due, stale critical, evidence,
  documentation gaps, decision timeline, project coverage, components by type, critical
  components, components without decisions) and makes `architecture.decisions` available (version
  2; ADRs 0041–0045). No architecture quality score; gaps are listed, never scored.
- Phase 9 adds 3 available Engineering Analytics metrics (`engineering.activity`,
  `engineering.activity_trend`, `engineering.activity_by_domain`) — a cross-domain view of dated
  engineering events (recorded output, not time spent; no score) with comparison periods — and
  catalogues 4 DORA metrics (deployment frequency, lead time, change failure rate, time to restore)
  plus technical debt as **unavailable**: PEOS has no integration data source and never fabricates
  them (ADR 0051).
- Phase 9.6 adds 10 GitHub metrics (`github` category): repository portfolio (total, active, by
  visibility/type/activity, language distribution) and commit intelligence (commits, trend, by
  repository, active days). Computed from synced GitHub data (sync → store → aggregate), UTC
  aggregation, observed activity only — never a productivity/quality score (ADR 0054).
- Every metric counts only records owned by the signed-in user.
- Frequency: computed live on request. Nothing is cached, pre-aggregated or estimated.
- Periods are whole UTC calendar days, inclusive. "Today" is the UTC calendar day.
- Result states: `ok`, `zero`, `no_data`, `insufficient_data`, `unavailable` (ADR 0019).
  Computed-health components add `scored` and `not_applicable` (ADR 0024).
- Value types: `count`, `distribution`, `ratio` (0–1; numerator and denominator in the
  breakdown), `score` (0–100; explained by components), `matrix`.

## Summary

| Key                                       | Name                                   | Availability                    | Drill-down                                                                                         |
| ----------------------------------------- | -------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| projects.total                            | Projects                               | available                       | Projects list with the same filters                                                                |
| projects.active                           | Active projects                        | available                       | Projects list filtered to the active lifecycle group                                               |
| projects.production                       | Production systems                     | available                       | Projects list filtered to the production lifecycle group                                           |
| projects.completed_in_period              | Projects completed                     | available                       | Projects list filtered to completion dates in the period                                           |
| projects.health_distribution              | Project health                         | available                       | Projects list filtered to the selected health state                                                |
| projects.lifecycle_distribution           | Projects by lifecycle status           | available                       | Projects list filtered to the selected status                                                      |
| projects.delivery_rate                    | Delivery rate                          | available                       | Milestones list: completed (status=completed) and overdue (overdue=true)                           |
| projects.milestones_total                 | Milestones                             | available                       | Milestones list (per project: projectId filter)                                                    |
| projects.milestones_completed             | Completed milestones                   | available                       | Milestones list filtered to status=completed                                                       |
| projects.milestones_completed_in_period   | Milestones completed                   | available                       | Milestones list filtered to completedFrom/completedTo                                              |
| projects.milestones_overdue               | Overdue milestones                     | available                       | Milestones list filtered to overdue=true                                                           |
| projects.milestones_blocked               | Blocked milestones                     | available                       | Milestones list filtered to status=blocked                                                         |
| projects.milestone_completion_trend       | Milestone completions over time        | available                       | Milestones list filtered to the month's completion dates                                           |
| projects.delivery_trend                   | Project delivery trend                 | available                       | Projects list filtered to the month's completion dates                                             |
| projects.health_score                     | Computed project health                | available                       | Project dossier, Health section (component breakdown)                                              |
| projects.health_component.schedule        | Health component: schedule             | available                       | Project dossier, Health section                                                                    |
| projects.health_component.milestones      | Health component: milestone completion | available                       | Project dossier, Delivery section                                                                  |
| projects.health_component.blockers        | Health component: blockers             | available                       | Milestones list filtered to the project and status=blocked                                         |
| projects.health_component.recent_activity | Health component: recent activity      | available                       | Project dossier, Activity section                                                                  |
| projects.health_component.scope_stability | Health component: scope stability      | Specification decision required | —                                                                                                  |
| projects.health_component.issue_severity  | Health component: issue severity       | Phase 9 — Engineering Analytics | —                                                                                                  |
| projects.computed_health_distribution     | Projects by computed health            | available                       | Computed health list filtered to the band                                                          |
| projects.health_comparison                | Manual vs computed health              | available                       | Computed health list filtered to manual status and band                                            |
| projects.technology_usage                 | Technology usage across projects       | available                       | Projects list filtered to the technology (technologyId)                                            |
| projects.evidence_coverage                | Project evidence coverage              | available                       | Projects list filtered to hasEvidence=true / false                                                 |
| projects.evidence_linked                  | Project evidence                       | available                       | Evidence list filtered to the project (projectId)                                                  |
| projects.evidence_verified                | Verified project evidence              | available                       | Evidence list filtered to the project and verified=true                                            |
| projects.evidence_by_type                 | Project evidence by type               | available                       | Evidence list filtered to the project and type                                                     |
| projects.blocked_time                     | Blocked time                           | Specification decision required | —                                                                                                  |
| projects.portfolio_matrix                 | Project portfolio matrix               | Specification decision required | —                                                                                                  |
| projects.technology_heatmap               | Technology heatmap                     | Specification decision required | —                                                                                                  |
| evidence.total                            | Evidence items                         | available                       | Evidence list with the same filters                                                                |
| evidence.verified                         | Verified evidence                      | available                       | Evidence list filtered to verified                                                                 |
| evidence.velocity                         | Evidence velocity                      | available                       | Evidence list filtered to verified items dated in the period                                       |
| evidence.undated                          | Undated evidence                       | available                       | Evidence list filtered to undated items                                                            |
| skills.total                              | Skills                                 | available                       | Skills list                                                                                        |
| skills.active                             | Active skills                          | available                       | Skills list filtered to active                                                                     |
| skills.with_target                        | Skills with a target level             | available                       | Skills list filtered to skills with a target                                                       |
| skills.with_evidence                      | Skills with evidence                   | available                       | Skills list filtered to skills with evidence                                                       |
| skills.without_evidence                   | Active skills without evidence         | available                       | Skills list filtered to active skills without evidence                                             |
| skills.by_category                        | Skills by category                     | available                       | Skills list filtered to the selected category                                                      |
| certifications.total                      | Certifications                         | available                       | Certifications list                                                                                |
| certifications.expiry_distribution        | Certification expiry                   | available                       | Certifications list filtered to the selected expiry state                                          |
| certifications.expiring                   | Certifications expiring                | available                       | Certifications list filtered to expiring                                                           |
| goals.active                              | Active goals                           | available                       | Goals list filtered to status=active                                                               |
| goals.total                               | Goals                                  | available                       | Goals list                                                                                         |
| goals.overdue                             | Overdue goals                          | available                       | Goals list filtered to overdue=true                                                                |
| goals.completion_rate                     | Goal completion rate                   | available                       | Goals list filtered to status=completed (numerator); overdue=true adds the rest of the denominator |
| goals.at_risk                             | Goals at risk                          | available                       | Goals list filtered to risk=at_risk                                                                |
| goals.on_track                            | On-track goals                         | available                       | Goals list filtered to risk=on_track                                                               |
| goals.risk_distribution                   | Open goals by risk state               | available                       | Goals list filtered to the risk state                                                              |
| goals.status_distribution                 | Goals by lifecycle status              | available                       | Goals list filtered to the status                                                                  |
| goals.target_attainment                   | Target attainment                      | available                       | Goals list filtered to committed=true&attainment=attained (numerator)                              |
| goals.attainment_distribution             | Goals by target attainment             | available                       | Goals list filtered to committed=true and the attainment state                                     |
| goals.without_deadline                    | Open goals without a deadline          | available                       | Goals list filtered to open=true&hasDeadline=false                                                 |
| goals.without_projects                    | Open goals without projects            | available                       | Goals list filtered to open=true&hasProjects=false                                                 |
| goals.without_skills                      | Open goals without skills              | available                       | Goals list filtered to open=true&hasSkills=false                                                   |
| goals.with_skill_gaps                     | Open goals affected by skill gaps      | available                       | Goals list filtered to open=true&skillGap=true                                                     |
| goals.deadline_load                       | Roadmap load by quarter                | available                       | Goals list filtered to the quarter's deadline range (open goals)                                   |
| goals.milestone_progress                  | Goal milestone progress                | available                       | Goal dossier, Milestones section                                                                   |
| goals.burndown                            | Goal burndown                          | available                       | Goal dossier, Measurements table                                                                   |
| skills.coverage                           | Skill coverage                         | available                       | Skill intelligence list: active, with target, freshness = fresh (numerator)                        |
| skills.critical_gaps                      | Critical skill gaps                    | available                       | Skill intelligence list filtered to critical=true                                                  |
| skills.freshness                          | Skill freshness                        | available                       | Skill intelligence list filtered to the freshness state                                            |
| skills.current_level                      | Evidence-derived skill level           | available                       | Skill dossier (rule-by-rule breakdown)                                                             |
| skills.level_distribution                 | Skills by derived level                | available                       | Skill intelligence list filtered to the level                                                      |
| skills.gap_distribution                   | Skills by gap state                    | available                       | Skill intelligence list filtered to the gap state                                                  |
| skills.targets_without_evidence           | Targets without evidence               | available                       | Skill intelligence list filtered to targetWithoutEvidence=true                                     |
| skills.growth                             | Skill demonstration trend              | available                       | Skill intelligence list filtered to the trend state                                                |
| skills.production_evidence                | Skills with production evidence        | available                       | Skill intelligence list filtered to productionLinked=true                                          |
| skills.radar                              | Skill radar                            | available                       | Skill dossier per axis; skill intelligence list                                                    |
| skills.learning_velocity                  | Learning velocity                      | Specification decision required | —                                                                                                  |
| evidence.production_ratio                 | Production evidence ratio              | Specification decision required | —                                                                                                  |
| ai.experiments                            | AI experiments                         | available                       | Experiments list with the same filters                                                             |
| ai.active_experiments                     | Active experiments                     | available                       | Experiments list filtered to open=true                                                             |
| ai.completed_experiments                  | Completed experiments                  | available                       | Experiments list filtered to status=completed                                                      |
| ai.abandoned_experiments                  | Abandoned experiments                  | available                       | Experiments list filtered to status=abandoned                                                      |
| ai.runs_total                             | Experiment runs                        | available                       | Experiments list filtered to those with recorded runs                                              |
| ai.experiments_by_status                  | Experiments by status                  | available                       | Experiments list filtered to the status                                                            |
| ai.experiments_by_decision                | Experiments by decision                | available                       | Experiments list filtered to the decision (undecided has no list filter)                           |
| ai.experiments_by_category                | Experiments by category                | available                       | Experiments list filtered to the category (uncategorised has no list filter)                       |
| ai.reproducibility_distribution           | Reproducibility (recorded metadata)    | available                       | Experiments list filtered to the reproducibility state                                             |
| ai.adoption_rate                          | Adoption rate                          | available                       | Experiments list filtered to decision=adopt (numerator)                                            |
| ai.evaluation_coverage                    | Evaluation coverage                    | available                       | Experiments list filtered to hasEvaluation=true (numerator)                                        |
| ai.experiments_missing_evaluation         | Experiments missing evaluation         | available                       | Experiments list filtered to hasRuns=true&hasEvaluation=false                                      |
| ai.experiments_missing_provenance         | Experiments missing evidence           | available                       | Experiments list filtered to hasEvidence=false                                                     |
| ai.experiments_per_month                  | Experiments per month                  | available                       | Experiments list filtered to the month the experiment was created (createdFrom/To)                 |
| architecture.decisions                    | Architecture decisions                 | available                       | Architecture decisions list                                                                        |
| architecture.decisions_in_force           | Decisions in force                     | available                       | Decisions list filtered to inForce=true                                                            |
| architecture.decisions_by_status          | Decisions by status                    | available                       | Decisions list filtered to the status                                                              |
| architecture.revisit_due                  | Decisions due for revisit              | available                       | Decisions list filtered to revisitDue=true                                                         |
| architecture.stale_critical_decisions     | Stale critical decisions               | available                       | Decisions list filtered to staleCritical=true                                                      |
| architecture.decisions_without_evidence   | Decisions without evidence             | available                       | Decisions list filtered to hasEvidence=false                                                       |
| architecture.decisions_with_gaps          | Decisions with documentation gaps      | available                       | Decisions list filtered to incomplete=true                                                         |
| architecture.decision_timeline            | Architecture decision timeline         | available                       | Decisions list filtered to decidedFrom/To of the month                                             |
| architecture.project_coverage             | Project architecture coverage          | available                       | Projects list filtered to hasArchitecture=true (numerator)                                         |
| architecture.components                   | Architecture components                | available                       | Components list                                                                                    |
| architecture.components_by_type           | Components by type                     | available                       | Components list filtered to the type                                                               |
| architecture.critical_components          | Critical components                    | available                       | Components list filtered to critical=true                                                          |
| architecture.components_without_decisions | Components without decisions           | available                       | Components list filtered to hasDecisions=false                                                     |
| engineering.technical_debt_trend          | Technical debt trend                   | Phase 9 — Engineering Analytics | —                                                                                                  |

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

| Field                 | Value                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `projects.health_component.issue_severity`                                                                               |
| Name                  | Health component: issue severity                                                                                         |
| Category              | projects                                                                                                                 |
| Definition            | Severity of open issues affecting the project.                                                                           |
| Formula               | `Requires an issue data source`                                                                                          |
| Source                | Issues (not modelled; integrations)                                                                                      |
| Frequency             | Per integration sync                                                                                                     |
| Owner                 | PEOS Projects domain (src/modules/projects)                                                                              |
| Caveats               | 05: do not fabricate metrics when integrations are unavailable.                                                          |
| Value type / temporal | score / point_in_time                                                                                                    |
| Availability          | **Unavailable** — Future — requires an engineering integration (GitHub/CI/CD/issue tracker): PEOS has no issue tracking. |
| Drill-down target     | None                                                                                                                     |
| Spec reference        | 01 §3 — issue severity                                                                                                   |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                           |

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

| Field                 | Value                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `goals.active`                                                                                                                                 |
| Name                  | Active goals                                                                                                                                   |
| Category              | goals                                                                                                                                          |
| Definition            | Goals whose lifecycle status is active (committed and in progress).                                                                            |
| Formula               | `COUNT(goals WHERE status = active)`                                                                                                           |
| Source                | Goal.status                                                                                                                                    |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                    |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                                          |
| Caveats               | Only records owned by the signed-in user are counted. • Status is set by the user (goal-lifecycle-v1); on-hold and draft goals are not active. |
| Value type / temporal | count / point_in_time                                                                                                                          |
| Availability          | Available                                                                                                                                      |
| Drill-down target     | Goals list filtered to status=active                                                                                                           |
| Spec reference        | 00 §4 KPI strip — Active Goals                                                                                                                 |
| Version               | v2 (introduced 2026-10-02, revised 2026-10-03)                                                                                                 |

#### `goals.total` — Goals

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `goals.total`                                                               |
| Name                  | Goals                                                                       |
| Category              | goals                                                                       |
| Definition            | All goals, in any status.                                                   |
| Formula               | `COUNT(goals)`                                                              |
| Source                | Goal                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS Goals domain (src/modules/goals)                                       |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | count / point_in_time                                                       |
| Availability          | Available                                                                   |
| Drill-down target     | Goals list                                                                  |
| Spec reference        | 08 Phase 5                                                                  |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `goals.overdue` — Overdue goals

| Field                 | Value                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `goals.overdue`                                                                                                                                                     |
| Name                  | Overdue goals                                                                                                                                                       |
| Category              | goals                                                                                                                                                               |
| Definition            | Open goals (active or on hold) whose deadline is before today.                                                                                                      |
| Formula               | `COUNT(goals WHERE status IN (active, on_hold) AND deadline < today)`                                                                                               |
| Source                | Goal.status, Goal.deadline                                                                                                                                          |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                         |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                                                               |
| Caveats               | Only records owned by the signed-in user are counted. • Today is the UTC calendar day; a goal due today is not overdue. Goals without a deadline are never overdue. |
| Value type / temporal | count / point_in_time                                                                                                                                               |
| Availability          | Available                                                                                                                                                           |
| Drill-down target     | Goals list filtered to overdue=true                                                                                                                                 |
| Spec reference        | 05 Goal Metrics — overdue goals                                                                                                                                     |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                      |

#### `goals.completion_rate` — Goal completion rate

| Field                 | Value                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `goals.completion_rate`                                                                                                                                                                                                                                         |
| Name                  | Goal completion rate                                                                                                                                                                                                                                            |
| Category              | goals                                                                                                                                                                                                                                                           |
| Definition            | Completed goals among goals that are either completed or overdue (same shape as the project delivery rate).                                                                                                                                                     |
| Formula               | `COUNT(status = completed) / (COUNT(status = completed) + COUNT(overdue))`                                                                                                                                                                                      |
| Source                | Goal.status, Goal.deadline                                                                                                                                                                                                                                      |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                     |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                                                                                                                                                           |
| Caveats               | Only records owned by the signed-in user are counted. • Goals not yet due, drafts and cancelled goals are excluded. Empty denominator → insufficient data, never 0 % or 100 %. • Completion is the user's lifecycle decision; it is not inferred from progress. |
| Value type / temporal | ratio / point_in_time                                                                                                                                                                                                                                           |
| Availability          | Available                                                                                                                                                                                                                                                       |
| Drill-down target     | Goals list filtered to status=completed (numerator); overdue=true adds the rest of the denominator                                                                                                                                                              |
| Spec reference        | 05 Goal Metrics — completion rate; ADR 0034                                                                                                                                                                                                                     |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                                                  |

#### `goals.at_risk` — Goals at risk

| Field                 | Value                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `goals.at_risk`                                                                                                                                                                                                                        |
| Name                  | Goals at risk                                                                                                                                                                                                                          |
| Category              | goals                                                                                                                                                                                                                                  |
| Definition            | Open goals with at least one risk signal (goal-risk-v1).                                                                                                                                                                               |
| Formula               | `COUNT(open goals WITH ≥ 1 of: overdue; overdue or blocked linked milestones; contributing project manual health at risk/blocked; linked skill with a critical gap; cancelled or overdue dependency; measurement worse than baseline)` |
| Source                | Goal, Milestone, Project.healthStatus, Skill intelligence (gap-analysis-v1), GoalDependency, GoalMeasurement                                                                                                                           |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                            |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                                                                                                                                  |
| Caveats               | Only records owned by the signed-in user are counted. • Signals are listed, never weighted or scored (ADR 0033). • Manual confidence is not a risk input.                                                                              |
| Value type / temporal | count / point_in_time                                                                                                                                                                                                                  |
| Availability          | Available                                                                                                                                                                                                                              |
| Drill-down target     | Goals list filtered to risk=at_risk                                                                                                                                                                                                    |
| Spec reference        | 05 Goal Metrics — at-risk goals; 08 Phase 5 risk states; 00 §4 Attention — Goal at risk                                                                                                                                                |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                         |

#### `goals.on_track` — On-track goals

| Field                 | Value                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `goals.on_track`                                                                                                         |
| Name                  | On-track goals                                                                                                           |
| Category              | goals                                                                                                                    |
| Definition            | Open goals with no risk signal and at least one assessable input (deadline, links or measurements).                      |
| Formula               | `COUNT(open goals WHERE risk = on_track)`                                                                                |
| Source                | Goal, Milestone, Project, Skill intelligence, GoalDependency, GoalMeasurement                                            |
| Frequency             | On request — computed live from the database when the Command Center loads.                                              |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                    |
| Caveats               | Only records owned by the signed-in user are counted. • Goals with nothing to assess are 'not assessable', not on track. |
| Value type / temporal | count / point_in_time                                                                                                    |
| Availability          | Available                                                                                                                |
| Drill-down target     | Goals list filtered to risk=on_track                                                                                     |
| Spec reference        | 05 Goal Metrics — on-track goals                                                                                         |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                           |

#### `goals.risk_distribution` — Open goals by risk state

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `goals.risk_distribution`                                                   |
| Name                  | Open goals by risk state                                                    |
| Category              | goals                                                                       |
| Definition            | Open goals that are at risk, on track, or not assessable.                   |
| Formula               | `COUNT(open goals) GROUP BY goal-risk-v1 state`                             |
| Source                | goal-risk-v1                                                                |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS Goals domain (src/modules/goals)                                       |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | distribution / point_in_time                                                |
| Availability          | Available                                                                   |
| Drill-down target     | Goals list filtered to the risk state                                       |
| Spec reference        | 08 Phase 5 — risk states                                                    |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `goals.status_distribution` — Goals by lifecycle status

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `goals.status_distribution`                                                 |
| Name                  | Goals by lifecycle status                                                   |
| Category              | goals                                                                       |
| Definition            | Goals per lifecycle status.                                                 |
| Formula               | `COUNT(goals) GROUP BY status`                                              |
| Source                | Goal.status                                                                 |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS Goals domain (src/modules/goals)                                       |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | distribution / point_in_time                                                |
| Availability          | Available                                                                   |
| Drill-down target     | Goals list filtered to the status                                           |
| Spec reference        | ADR 0031                                                                    |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `goals.target_attainment` — Target attainment

| Field                 | Value                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `goals.target_attainment`                                                                                                                                                                                                                                                                                                                      |
| Name                  | Target attainment                                                                                                                                                                                                                                                                                                                              |
| Category              | goals                                                                                                                                                                                                                                                                                                                                          |
| Definition            | Share of measurable goals (open or completed, with baseline, target and a measurement) whose latest measurement has reached the target.                                                                                                                                                                                                        |
| Formula               | `COUNT(attainment = attained) / COUNT(attainment computable); attainment = (latest − baseline) / (target − baseline) ≥ 1 (goal-attainment-v1)`                                                                                                                                                                                                 |
| Source                | Goal.baseline, Goal.target, GoalMeasurement                                                                                                                                                                                                                                                                                                    |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                                                                                                    |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                                                                                                                                                                                                                                          |
| Caveats               | Only records owned by the signed-in user are counted. • Direction comes from the sign of target − baseline (lower-is-better metrics work). • Goals without baseline, target or a measurement are not computable and excluded — never counted as 0 % or 100 %. • Measurements are recorded by the user; future-dated measurements are rejected. |
| Value type / temporal | ratio / point_in_time                                                                                                                                                                                                                                                                                                                          |
| Availability          | Available                                                                                                                                                                                                                                                                                                                                      |
| Drill-down target     | Goals list filtered to committed=true&attainment=attained (numerator)                                                                                                                                                                                                                                                                          |
| Spec reference        | 05 Goal Metrics — target attainment; ADR 0034                                                                                                                                                                                                                                                                                                  |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                                                                                                                                 |

#### `goals.attainment_distribution` — Goals by target attainment

| Field                 | Value                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `goals.attainment_distribution`                                                                                                      |
| Name                  | Goals by target attainment                                                                                                           |
| Category              | goals                                                                                                                                |
| Definition            | Open or completed goals by attainment state: attained, in progress, regressed, not computable.                                       |
| Formula               | `COUNT(open or completed goals) GROUP BY goal-attainment-v1 state`                                                                   |
| Source                | Goal.baseline, Goal.target, GoalMeasurement                                                                                          |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                          |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                                |
| Caveats               | Only records owned by the signed-in user are counted. • 'Not computable' lists goals that lack a measurable target or a measurement. |
| Value type / temporal | distribution / point_in_time                                                                                                         |
| Availability          | Available                                                                                                                            |
| Drill-down target     | Goals list filtered to committed=true and the attainment state                                                                       |
| Spec reference        | 05 Goal Metrics — target attainment                                                                                                  |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                       |

#### `goals.without_deadline` — Open goals without a deadline

| Field                 | Value                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `goals.without_deadline`                                                                                                                    |
| Name                  | Open goals without a deadline                                                                                                               |
| Category              | goals                                                                                                                                       |
| Definition            | Open goals that have no deadline.                                                                                                           |
| Formula               | `COUNT(open goals WHERE deadline IS NULL)`                                                                                                  |
| Source                | Goal.deadline                                                                                                                               |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                 |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                                       |
| Caveats               | Only records owned by the signed-in user are counted. • A data-completeness signal; such goals cannot be overdue or placed on the timeline. |
| Value type / temporal | count / point_in_time                                                                                                                       |
| Availability          | Available                                                                                                                                   |
| Drill-down target     | Goals list filtered to open=true&hasDeadline=false                                                                                          |
| Spec reference        | 08 Phase 5 — roadmap                                                                                                                        |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                              |

#### `goals.without_projects` — Open goals without projects

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `goals.without_projects`                                                    |
| Name                  | Open goals without projects                                                 |
| Category              | goals                                                                       |
| Definition            | Open goals with no contributing project linked.                             |
| Formula               | `COUNT(open goals WITH no goal_projects)`                                   |
| Source                | GoalProject                                                                 |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS Goals domain (src/modules/goals)                                       |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | count / point_in_time                                                       |
| Availability          | Available                                                                   |
| Drill-down target     | Goals list filtered to open=true&hasProjects=false                          |
| Spec reference        | 08 Phase 5 acceptance — goals connect to projects                           |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `goals.without_skills` — Open goals without skills

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `goals.without_skills`                                                      |
| Name                  | Open goals without skills                                                   |
| Category              | goals                                                                       |
| Definition            | Open goals with no skill linked.                                            |
| Formula               | `COUNT(open goals WITH no goal_skills)`                                     |
| Source                | GoalSkill                                                                   |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS Goals domain (src/modules/goals)                                       |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | count / point_in_time                                                       |
| Availability          | Available                                                                   |
| Drill-down target     | Goals list filtered to open=true&hasSkills=false                            |
| Spec reference        | 08 Phase 5 acceptance — goals connect to skills                             |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `goals.with_skill_gaps` — Open goals affected by skill gaps

| Field                 | Value                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `goals.with_skill_gaps`                                                                                                             |
| Name                  | Open goals affected by skill gaps                                                                                                   |
| Category              | goals                                                                                                                               |
| Definition            | Open goals with at least one linked skill whose evidence-derived level is below its target.                                         |
| Formula               | `COUNT(open goals WITH ≥ 1 linked skill in gap state below_target) — Phase 4 gap-analysis-v1`                                       |
| Source                | GoalSkill, Skill intelligence (skill-level-v1, gap-analysis-v1)                                                                     |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                         |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                               |
| Caveats               | Only records owned by the signed-in user are counted. • Skills without evidence are not gaps (they are 'not computable', ADR 0029). |
| Value type / temporal | count / point_in_time                                                                                                               |
| Availability          | Available                                                                                                                           |
| Drill-down target     | Goals list filtered to open=true&skillGap=true                                                                                      |
| Spec reference        | Phase 5 prompt §7; ADR 0029                                                                                                         |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                      |

#### `goals.deadline_load` — Roadmap load by quarter

| Field                 | Value                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Key                   | `goals.deadline_load`                                                                            |
| Name                  | Roadmap load by quarter                                                                          |
| Category              | goals                                                                                            |
| Definition            | Open goals per deadline quarter: overdue, the next four quarters, later, and without a deadline. |
| Formula               | `COUNT(open goals) GROUP BY quarter(deadline) with overdue and undated buckets`                  |
| Source                | Goal.deadline, Goal.status                                                                       |
| Frequency             | On request — computed live from the database when the Command Center loads.                      |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                            |
| Caveats               | Only records owned by the signed-in user are counted. • Quarters are UTC calendar quarters.      |
| Value type / temporal | distribution / point_in_time                                                                     |
| Availability          | Available                                                                                        |
| Drill-down target     | Goals list filtered to the quarter's deadline range (open goals)                                 |
| Spec reference        | 01 §8 Roadmap views — quarter board                                                              |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                   |

#### `goals.milestone_progress` — Goal milestone progress

| Field                 | Value                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `goals.milestone_progress`                                                                                                                                      |
| Name                  | Goal milestone progress                                                                                                                                         |
| Category              | goals                                                                                                                                                           |
| Definition            | For one goal: completed milestones among its linked, non-cancelled milestones.                                                                                  |
| Formula               | `COUNT(linked milestones WHERE status = completed) / COUNT(linked milestones WHERE status <> cancelled)`                                                        |
| Source                | Milestone.goalId, Milestone.status                                                                                                                              |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                     |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                                                           |
| Caveats               | Only records owned by the signed-in user are counted. • No linked milestones → not computable. A milestone counts toward one goal only (04 Goal 1:N Milestone). |
| Value type / temporal | ratio / point_in_time                                                                                                                                           |
| Availability          | Available                                                                                                                                                       |
| Drill-down target     | Goal dossier, Milestones section                                                                                                                                |
| Spec reference        | 04 Milestone.goalId; 08 Phase 5 — progress metrics                                                                                                              |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                  |

#### `goals.burndown` — Goal burndown

| Field                 | Value                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `goals.burndown`                                                                                                                       |
| Name                  | Goal burndown                                                                                                                          |
| Category              | goals                                                                                                                                  |
| Definition            | For one goal: recorded measurements of its metric over time against baseline and target.                                               |
| Formula               | `Series of GoalMeasurement(date, value) with baseline and target reference lines`                                                      |
| Source                | GoalMeasurement, Goal.baseline, Goal.target                                                                                            |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                            |
| Owner                 | PEOS Goals domain (src/modules/goals)                                                                                                  |
| Caveats               | Only records owned by the signed-in user are counted. • Only recorded measurements are plotted — nothing is interpolated or projected. |
| Value type / temporal | distribution / period                                                                                                                  |
| Availability          | Available                                                                                                                              |
| Drill-down target     | Goal dossier, Measurements table                                                                                                       |
| Spec reference        | 05 Visualization Catalog — Goal Burndown                                                                                               |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                         |

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

| Field                 | Value                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Key                   | `ai.experiments`                                                                                                       |
| Name                  | AI experiments                                                                                                         |
| Category              | ai                                                                                                                     |
| Definition            | Number of AI experiments recorded (04 AIExperiment).                                                                   |
| Formula               | `COUNT(ai_experiments)`                                                                                                |
| Source                | AIExperiment                                                                                                           |
| Frequency             | On request — computed live from the database when the Command Center loads.                                            |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                           |
| Caveats               | Only records owned by the signed-in user are counted. • PEOS records experiments; it does not execute them (ADR 0040). |
| Value type / temporal | count / point_in_time                                                                                                  |
| Availability          | Available                                                                                                              |
| Drill-down target     | Experiments list with the same filters                                                                                 |
| Spec reference        | 00 §4 KPI strip — AI Experiments; 01 §4; ADR 0036                                                                      |
| Version               | v2 (introduced 2026-10-03, revised 2026-10-03)                                                                         |

#### `ai.active_experiments` — Active experiments

| Field                 | Value                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `ai.active_experiments`                                                                                                                  |
| Name                  | Active experiments                                                                                                                       |
| Category              | ai                                                                                                                                       |
| Definition            | Experiments that are planned or active (not yet completed or abandoned).                                                                 |
| Formula               | `COUNT(status IN (planned, active))`                                                                                                     |
| Source                | AIExperiment.status                                                                                                                      |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                              |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                                             |
| Caveats               | Only records owned by the signed-in user are counted. • Completion is a lifecycle decision and is never equated with success (ADR 0037). |
| Value type / temporal | count / point_in_time                                                                                                                    |
| Availability          | Available                                                                                                                                |
| Drill-down target     | Experiments list filtered to open=true                                                                                                   |
| Spec reference        | 08 Phase 6; ADR 0037                                                                                                                     |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                           |

#### `ai.completed_experiments` — Completed experiments

| Field                 | Value                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `ai.completed_experiments`                                                                                                           |
| Name                  | Completed experiments                                                                                                                |
| Category              | ai                                                                                                                                   |
| Definition            | Experiments whose lifecycle status is completed (regardless of their decision).                                                      |
| Formula               | `COUNT(status = completed)`                                                                                                          |
| Source                | AIExperiment.status                                                                                                                  |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                          |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                                         |
| Caveats               | Only records owned by the signed-in user are counted. • Completed ≠ successful; the owner's decision is a separate field (ADR 0037). |
| Value type / temporal | count / point_in_time                                                                                                                |
| Availability          | Available                                                                                                                            |
| Drill-down target     | Experiments list filtered to status=completed                                                                                        |
| Spec reference        | 08 Phase 6; ADR 0037                                                                                                                 |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                       |

#### `ai.abandoned_experiments` — Abandoned experiments

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `ai.abandoned_experiments`                                                  |
| Name                  | Abandoned experiments                                                       |
| Category              | ai                                                                          |
| Definition            | Experiments stopped without a conclusion.                                   |
| Formula               | `COUNT(status = abandoned)`                                                 |
| Source                | AIExperiment.status                                                         |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | count / point_in_time                                                       |
| Availability          | Available                                                                   |
| Drill-down target     | Experiments list filtered to status=abandoned                               |
| Spec reference        | 08 Phase 6; ADR 0037                                                        |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `ai.runs_total` — Experiment runs

| Field                 | Value                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Key                   | `ai.runs_total`                                                                                                     |
| Name                  | Experiment runs                                                                                                     |
| Category              | ai                                                                                                                  |
| Definition            | Total recorded runs/iterations across all experiments.                                                              |
| Formula               | `COUNT(experiment_runs)`                                                                                            |
| Source                | ExperimentRun                                                                                                       |
| Frequency             | On request — computed live from the database when the Command Center loads.                                         |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                        |
| Caveats               | Only records owned by the signed-in user are counted. • Runs are append-only; deleting a run is audited (ADR 0037). |
| Value type / temporal | count / point_in_time                                                                                               |
| Availability          | Available                                                                                                           |
| Drill-down target     | Experiments list filtered to those with recorded runs                                                               |
| Spec reference        | 01 §4; ADR 0037                                                                                                     |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                      |

#### `ai.experiments_by_status` — Experiments by status

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `ai.experiments_by_status`                                                  |
| Name                  | Experiments by status                                                       |
| Category              | ai                                                                          |
| Definition            | Experiment counts per lifecycle status.                                     |
| Formula               | `COUNT(ai_experiments) GROUP BY status`                                     |
| Source                | AIExperiment.status                                                         |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | distribution / point_in_time                                                |
| Availability          | Available                                                                   |
| Drill-down target     | Experiments list filtered to the status                                     |
| Spec reference        | 05 AI Metrics; ADR 0037                                                     |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `ai.experiments_by_decision` — Experiments by decision

| Field                 | Value                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `ai.experiments_by_decision`                                                                                                |
| Name                  | Experiments by decision                                                                                                     |
| Category              | ai                                                                                                                          |
| Definition            | Experiment counts per owner decision (adopt, reject, inconclusive) plus undecided.                                          |
| Formula               | `COUNT(ai_experiments) GROUP BY decision (NULL → undecided)`                                                                |
| Source                | AIExperiment.decision                                                                                                       |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                 |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                                |
| Caveats               | Only records owned by the signed-in user are counted. • Decision is the owner's interpretation, entered by hand (ADR 0037). |
| Value type / temporal | distribution / point_in_time                                                                                                |
| Availability          | Available                                                                                                                   |
| Drill-down target     | Experiments list filtered to the decision (undecided has no list filter)                                                    |
| Spec reference        | 04 AIExperiment.decision; ADR 0037                                                                                          |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                              |

#### `ai.experiments_by_category` — Experiments by category

| Field                 | Value                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Key                   | `ai.experiments_by_category`                                                                                           |
| Name                  | Experiments by category                                                                                                |
| Category              | ai                                                                                                                     |
| Definition            | Experiment counts per free-text category, plus an uncategorised bucket.                                                |
| Formula               | `COUNT(ai_experiments) GROUP BY category (NULL → uncategorised)`                                                       |
| Source                | AIExperiment.category                                                                                                  |
| Frequency             | On request — computed live from the database when the Command Center loads.                                            |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                           |
| Caveats               | Only records owned by the signed-in user are counted. • Category is free text; there is no closed taxonomy (ADR 0036). |
| Value type / temporal | distribution / point_in_time                                                                                           |
| Availability          | Available                                                                                                              |
| Drill-down target     | Experiments list filtered to the category (uncategorised has no list filter)                                           |
| Spec reference        | 01 §4; ADR 0036                                                                                                        |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                         |

#### `ai.reproducibility_distribution` — Reproducibility (recorded metadata)

| Field                 | Value                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `ai.reproducibility_distribution`                                                                                                                                                    |
| Name                  | Reproducibility (recorded metadata)                                                                                                                                                  |
| Category              | ai                                                                                                                                                                                   |
| Definition            | Experiments by how completely their runs record reproduction metadata (reproducible / partial / not recorded / unknown).                                                             |
| Formula               | `classify each experiment from its runs' recorded model, modelVersion, promptVersion, datasetName and codeRef`                                                                       |
| Source                | ExperimentRun                                                                                                                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                          |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                                                                                         |
| Caveats               | Only records owned by the signed-in user are counted. • Measures recorded metadata completeness, NOT a verified reproduction (ADR 0039). • Unknown = the experiment has no runs yet. |
| Value type / temporal | distribution / point_in_time                                                                                                                                                         |
| Availability          | Available                                                                                                                                                                            |
| Drill-down target     | Experiments list filtered to the reproducibility state                                                                                                                               |
| Spec reference        | 05 AI Metrics — reproducibility rate; ADR 0039                                                                                                                                       |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                       |

#### `ai.adoption_rate` — Adoption rate

| Field                 | Value                                                                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `ai.adoption_rate`                                                                                                                                                                                                                                                   |
| Name                  | Adoption rate                                                                                                                                                                                                                                                        |
| Category              | ai                                                                                                                                                                                                                                                                   |
| Definition            | Experiments decided to adopt among experiments with any recorded decision.                                                                                                                                                                                           |
| Formula               | `COUNT(decision = adopt) / COUNT(decision IS NOT NULL)`                                                                                                                                                                                                              |
| Source                | AIExperiment.decision                                                                                                                                                                                                                                                |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                          |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                                                                                                                                                                         |
| Caveats               | Only records owned by the signed-in user are counted. • Denominator is experiments with a recorded decision; undecided experiments are excluded. Empty → insufficient data, never 0 %. • This is the owner's decision rate, not a measured success score (ADR 0037). |
| Value type / temporal | ratio / point_in_time                                                                                                                                                                                                                                                |
| Availability          | Available                                                                                                                                                                                                                                                            |
| Drill-down target     | Experiments list filtered to decision=adopt (numerator)                                                                                                                                                                                                              |
| Spec reference        | 05 AI Metrics — successful experiment rate; ADR 0037                                                                                                                                                                                                                 |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                                                       |

#### `ai.evaluation_coverage` — Evaluation coverage

| Field                 | Value                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `ai.evaluation_coverage`                                                                                                                                    |
| Name                  | Evaluation coverage                                                                                                                                         |
| Category              | ai                                                                                                                                                          |
| Definition            | Experiments with at least one evaluated run among experiments that have any run.                                                                            |
| Formula               | `COUNT(experiments with an evaluated run) / COUNT(experiments with >=1 run)`                                                                                |
| Source                | ExperimentRun, ExperimentMetric                                                                                                                             |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                 |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                                                                |
| Caveats               | Only records owned by the signed-in user are counted. • An evaluated run has at least one recorded ExperimentMetric. Empty denominator → insufficient data. |
| Value type / temporal | ratio / point_in_time                                                                                                                                       |
| Availability          | Available                                                                                                                                                   |
| Drill-down target     | Experiments list filtered to hasEvaluation=true (numerator)                                                                                                 |
| Spec reference        | 01 §4 AI Evaluation; ADR 0038                                                                                                                               |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                              |

#### `ai.experiments_missing_evaluation` — Experiments missing evaluation

| Field                 | Value                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `ai.experiments_missing_evaluation`                                                                                         |
| Name                  | Experiments missing evaluation                                                                                              |
| Category              | ai                                                                                                                          |
| Definition            | Experiments that have runs but no recorded evaluation metric on any run.                                                    |
| Formula               | `COUNT(experiments with >=1 run AND 0 evaluated runs)`                                                                      |
| Source                | ExperimentRun, ExperimentMetric                                                                                             |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                 |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                                |
| Caveats               | Only records owned by the signed-in user are counted. • Experiments with no runs are not counted (nothing to evaluate yet). |
| Value type / temporal | count / point_in_time                                                                                                       |
| Availability          | Available                                                                                                                   |
| Drill-down target     | Experiments list filtered to hasRuns=true&hasEvaluation=false                                                               |
| Spec reference        | 01 §4; ADR 0038                                                                                                             |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                              |

#### `ai.experiments_missing_provenance` — Experiments missing evidence

| Field                 | Value                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Key                   | `ai.experiments_missing_provenance`                                                                              |
| Name                  | Experiments missing evidence                                                                                     |
| Category              | ai                                                                                                               |
| Definition            | Experiments with no linked evidence.                                                                             |
| Formula               | `COUNT(experiments with 0 evidence links)`                                                                       |
| Source                | ExperimentEvidence                                                                                               |
| Frequency             | On request — computed live from the database when the Command Center loads.                                      |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                     |
| Caveats               | Only records owned by the signed-in user are counted. • Evidence reuses the existing Evidence domain (ADR 0038). |
| Value type / temporal | count / point_in_time                                                                                            |
| Availability          | Available                                                                                                        |
| Drill-down target     | Experiments list filtered to hasEvidence=false                                                                   |
| Spec reference        | 00 §5 evidence-first; ADR 0038                                                                                   |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                   |

#### `ai.experiments_per_month` — Experiments per month

| Field                 | Value                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Key                   | `ai.experiments_per_month`                                                                                      |
| Name                  | Experiments per month                                                                                           |
| Category              | ai                                                                                                              |
| Definition            | Experiments created per UTC calendar month.                                                                     |
| Formula               | `COUNT(ai_experiments) GROUP BY to_char(created_at, 'YYYY-MM')`                                                 |
| Source                | AIExperiment.createdAt                                                                                          |
| Frequency             | On request — computed live from the database when the Command Center loads.                                     |
| Owner                 | PEOS AI Lab domain (src/modules/experiments)                                                                    |
| Caveats               | Only records owned by the signed-in user are counted. • By record creation date, not experiment execution date. |
| Value type / temporal | distribution / point_in_time                                                                                    |
| Availability          | Available                                                                                                       |
| Drill-down target     | Experiments list filtered to the month the experiment was created (createdFrom/To)                              |
| Spec reference        | 05 AI Metrics — experiments per month                                                                           |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                  |

#### `architecture.decisions` — Architecture decisions

| Field                 | Value                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.decisions`                                                                                                    |
| Name                  | Architecture decisions                                                                                                      |
| Category              | architecture                                                                                                                |
| Definition            | Number of architecture decision records documented by the owner (04 ArchitectureDecision).                                  |
| Formula               | `COUNT(architecture_decisions)`                                                                                             |
| Source                | ArchitectureDecision                                                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                 |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                                         |
| Caveats               | Only records owned by the signed-in user are counted. • All statuses, including superseded and rejected history (ADR 0042). |
| Value type / temporal | count / point_in_time                                                                                                       |
| Availability          | Available                                                                                                                   |
| Drill-down target     | Architecture decisions list                                                                                                 |
| Spec reference        | 00 §4 KPI strip — Architecture Decisions; ADR 0041                                                                          |
| Version               | v2 (introduced 2026-10-02, revised 2026-10-03)                                                                              |

#### `architecture.decisions_in_force` — Decisions in force

| Field                 | Value                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.decisions_in_force`                                                                                                           |
| Name                  | Decisions in force                                                                                                                          |
| Category              | architecture                                                                                                                                |
| Definition            | Decisions whose status is accepted — the ones currently governing the architecture.                                                         |
| Formula               | `COUNT(status = accepted)`                                                                                                                  |
| Source                | ArchitectureDecision.status                                                                                                                 |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                 |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                                                         |
| Caveats               | Only records owned by the signed-in user are counted. • Deprecated and superseded decisions remain visible as history but are not in force. |
| Value type / temporal | count / point_in_time                                                                                                                       |
| Availability          | Available                                                                                                                                   |
| Drill-down target     | Decisions list filtered to inForce=true                                                                                                     |
| Spec reference        | 01 §5 ADR status; ADR 0042                                                                                                                  |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                              |

#### `architecture.decisions_by_status` — Decisions by status

| Field                 | Value                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Key                   | `architecture.decisions_by_status`                                                           |
| Name                  | Decisions by status                                                                          |
| Category              | architecture                                                                                 |
| Definition            | Decision counts per lifecycle status (proposed, accepted, rejected, deprecated, superseded). |
| Formula               | `COUNT(architecture_decisions) GROUP BY status`                                              |
| Source                | ArchitectureDecision.status                                                                  |
| Frequency             | On request — computed live from the database when the Command Center loads.                  |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                          |
| Caveats               | Only records owned by the signed-in user are counted.                                        |
| Value type / temporal | distribution / point_in_time                                                                 |
| Availability          | Available                                                                                    |
| Drill-down target     | Decisions list filtered to the status                                                        |
| Spec reference        | 01 §5 ADR status; ADR 0042                                                                   |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                               |

#### `architecture.revisit_due` — Decisions due for revisit

| Field                 | Value                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.revisit_due`                                                                                                                                                                                    |
| Name                  | Decisions due for revisit                                                                                                                                                                                     |
| Category              | architecture                                                                                                                                                                                                  |
| Definition            | Accepted decisions whose recorded revisit date is before today (UTC).                                                                                                                                         |
| Formula               | `COUNT(status = accepted AND revisitDate < today)`                                                                                                                                                            |
| Source                | ArchitectureDecision.revisitDate, ArchitectureDecision.status                                                                                                                                                 |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                   |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                                                                                                                           |
| Caveats               | Only records owned by the signed-in user are counted. • Uses only the owner's recorded revisit date; age alone never makes a decision stale (ADR 0044). • Decisions without a revisit date are never counted. |
| Value type / temporal | count / point_in_time                                                                                                                                                                                         |
| Availability          | Available                                                                                                                                                                                                     |
| Drill-down target     | Decisions list filtered to revisitDue=true                                                                                                                                                                    |
| Spec reference        | 04 revisitDate; 10 Architecture — Revisit date; ADR 0044                                                                                                                                                      |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                |

#### `architecture.stale_critical_decisions` — Stale critical decisions

| Field                 | Value                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.stale_critical_decisions`                                                                                                     |
| Name                  | Stale critical decisions                                                                                                                    |
| Category              | architecture                                                                                                                                |
| Definition            | Decisions due for revisit that govern at least one component the owner marked critical.                                                     |
| Formula               | `COUNT(revisit due AND linked components with critical = true ≥ 1)`                                                                         |
| Source                | ArchitectureDecision, DecisionComponent, ArchitectureComponent.critical                                                                     |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                 |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                                                         |
| Caveats               | Only records owned by the signed-in user are counted. • Criticality is the owner's explicit flag on a component, never inferred (ADR 0044). |
| Value type / temporal | count / point_in_time                                                                                                                       |
| Availability          | Available                                                                                                                                   |
| Drill-down target     | Decisions list filtered to staleCritical=true                                                                                               |
| Spec reference        | 00 §4 Critical panel — Stale critical decision; ADR 0044                                                                                    |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                              |

#### `architecture.decisions_without_evidence` — Decisions without evidence

| Field                 | Value                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.decisions_without_evidence`                                                                                                          |
| Name                  | Decisions without evidence                                                                                                                         |
| Category              | architecture                                                                                                                                       |
| Definition            | Decisions with no linked evidence record.                                                                                                          |
| Formula               | `COUNT(decisions with 0 evidence links)`                                                                                                           |
| Source                | ArchitectureDecisionEvidence                                                                                                                       |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                        |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                                                                |
| Caveats               | Only records owned by the signed-in user are counted. • Missing evidence is shown as missing, not scored (00 §5 Architecture Decision → Evidence). |
| Value type / temporal | count / point_in_time                                                                                                                              |
| Availability          | Available                                                                                                                                          |
| Drill-down target     | Decisions list filtered to hasEvidence=false                                                                                                       |
| Spec reference        | 00 §5; ADR 0041                                                                                                                                    |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                     |

#### `architecture.decisions_with_gaps` — Decisions with documentation gaps

| Field                 | Value                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.decisions_with_gaps`                                                                                                                                                                             |
| Name                  | Decisions with documentation gaps                                                                                                                                                                              |
| Category              | architecture                                                                                                                                                                                                   |
| Definition            | Decisions missing at least one expected part: context, decision, consequences (decided records), alternatives, related project or evidence.                                                                    |
| Formula               | `COUNT(decisions with documentation-gaps-v1 list non-empty)`                                                                                                                                                   |
| Source                | ArchitectureDecision, ArchitectureAlternative, DecisionProject, ArchitectureDecisionEvidence                                                                                                                   |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                    |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                                                                                                                            |
| Caveats               | Only records owned by the signed-in user are counted. • A list of missing parts per decision — there is no completeness score (ADR 0044). • Proposals are not expected to have a decision or consequences yet. |
| Value type / temporal | count / point_in_time                                                                                                                                                                                          |
| Availability          | Available                                                                                                                                                                                                      |
| Drill-down target     | Decisions list filtered to incomplete=true                                                                                                                                                                     |
| Spec reference        | 10 Architecture acceptance; ADR 0044                                                                                                                                                                           |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                 |

#### `architecture.decision_timeline` — Architecture decision timeline

| Field                 | Value                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.decision_timeline`                                                                                                    |
| Name                  | Architecture decision timeline                                                                                                      |
| Category              | architecture                                                                                                                        |
| Definition            | Decisions per UTC month of their recorded decision date.                                                                            |
| Formula               | `COUNT(architecture_decisions WHERE decidedAt IS NOT NULL) GROUP BY to_char(decidedAt, 'YYYY-MM')`                                  |
| Source                | ArchitectureDecision.decidedAt                                                                                                      |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                         |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                                                 |
| Caveats               | Only records owned by the signed-in user are counted. • Proposals have no decision date and are excluded; dates are never inferred. |
| Value type / temporal | distribution / point_in_time                                                                                                        |
| Availability          | Available                                                                                                                           |
| Drill-down target     | Decisions list filtered to decidedFrom/To of the month                                                                              |
| Spec reference        | 00 §4 Required charts — Architecture decision timeline; 08 decision history                                                         |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                      |

#### `architecture.project_coverage` — Project architecture coverage

| Field                 | Value                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `architecture.project_coverage`                                                                                                                                                                                                      |
| Name                  | Project architecture coverage                                                                                                                                                                                                        |
| Category              | architecture                                                                                                                                                                                                                         |
| Definition            | Projects with at least one linked architecture decision among all projects.                                                                                                                                                          |
| Formula               | `COUNT(projects with ≥ 1 decision link) / COUNT(projects)`                                                                                                                                                                           |
| Source                | Project, DecisionProject                                                                                                                                                                                                             |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                          |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                                                                                                                                                  |
| Caveats               | Only records owned by the signed-in user are counted. • Covered means a decision is explicitly linked; using technologies does not count as architecture (ADR 0045). • All projects are in the denominator, including archived ones. |
| Value type / temporal | ratio / point_in_time                                                                                                                                                                                                                |
| Availability          | Available                                                                                                                                                                                                                            |
| Drill-down target     | Projects list filtered to hasArchitecture=true (numerator)                                                                                                                                                                           |
| Spec reference        | 08 Phase 7 acceptance — projects expose architecture; ADR 0045                                                                                                                                                                       |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                       |

#### `architecture.components` — Architecture components

| Field                 | Value                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.components`                                                                           |
| Name                  | Architecture components                                                                             |
| Category              | architecture                                                                                        |
| Definition            | Components in the registry (services, databases, queues, external APIs, AI models, infrastructure). |
| Formula               | `COUNT(architecture_components)`                                                                    |
| Source                | ArchitectureComponent                                                                               |
| Frequency             | On request — computed live from the database when the Command Center loads.                         |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                 |
| Caveats               | Only records owned by the signed-in user are counted.                                               |
| Value type / temporal | count / point_in_time                                                                               |
| Availability          | Available                                                                                           |
| Drill-down target     | Components list                                                                                     |
| Spec reference        | 08 component registry; 01 §5 Architecture Map; ADR 0043                                             |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                      |

#### `architecture.components_by_type` — Components by type

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Key                   | `architecture.components_by_type`                                           |
| Name                  | Components by type                                                          |
| Category              | architecture                                                                |
| Definition            | Component counts per 01 §5 node type.                                       |
| Formula               | `COUNT(architecture_components) GROUP BY type`                              |
| Source                | ArchitectureComponent.type                                                  |
| Frequency             | On request — computed live from the database when the Command Center loads. |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                         |
| Caveats               | Only records owned by the signed-in user are counted.                       |
| Value type / temporal | distribution / point_in_time                                                |
| Availability          | Available                                                                   |
| Drill-down target     | Components list filtered to the type                                        |
| Spec reference        | 01 §5 Architecture Map; ADR 0043                                            |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                              |

#### `architecture.critical_components` — Critical components

| Field                 | Value                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.critical_components`                                                                                                              |
| Name                  | Critical components                                                                                                                             |
| Category              | architecture                                                                                                                                    |
| Definition            | Components the owner marked critical.                                                                                                           |
| Formula               | `COUNT(critical = true)`                                                                                                                        |
| Source                | ArchitectureComponent.critical                                                                                                                  |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                     |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                                                             |
| Caveats               | Only records owned by the signed-in user are counted. • An explicit owner flag (05 Architecture Network — critical components), never inferred. |
| Value type / temporal | count / point_in_time                                                                                                                           |
| Availability          | Available                                                                                                                                       |
| Drill-down target     | Components list filtered to critical=true                                                                                                       |
| Spec reference        | 05 Architecture Network; ADR 0043                                                                                                               |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                  |

#### `architecture.components_without_decisions` — Components without decisions

| Field                 | Value                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Key                   | `architecture.components_without_decisions`                                                                          |
| Name                  | Components without decisions                                                                                         |
| Category              | architecture                                                                                                         |
| Definition            | Components not governed by any recorded architecture decision.                                                       |
| Formula               | `COUNT(components with 0 decision links)`                                                                            |
| Source                | DecisionComponent                                                                                                    |
| Frequency             | On request — computed live from the database when the Command Center loads.                                          |
| Owner                 | PEOS Architecture domain (src/modules/architecture)                                                                  |
| Caveats               | Only records owned by the signed-in user are counted. • Shows missing architecture context; not a quality judgement. |
| Value type / temporal | count / point_in_time                                                                                                |
| Availability          | Available                                                                                                            |
| Drill-down target     | Components list filtered to hasDecisions=false                                                                       |
| Spec reference        | 01 §5 node detail — decisions; ADR 0045                                                                              |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                       |

#### `engineering.activity` — Engineering activity

| Field                 | Value                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `engineering.activity`                                                                                                                                                                                                                                                                                                                                                                                                     |
| Name                  | Engineering activity                                                                                                                                                                                                                                                                                                                                                                                                       |
| Category              | engineering                                                                                                                                                                                                                                                                                                                                                                                                                |
| Definition            | Count of dated engineering events recorded in the selected period across all domains: project and milestone completions, evidence recorded, goals completed, architecture decisions, experiment runs completed, and certifications earned.                                                                                                                                                                                 |
| Formula               | `SUM over events of COUNT(event WHERE event_date BETWEEN period.start AND period.end), events = {Project.completedAt, Milestone.completedAt, Evidence.date, Goal.completedAt, ArchitectureDecision.decidedAt, ExperimentRun.completedAt, Certification.issueDate}`                                                                                                                                                         |
| Source                | Project.completedAt, Milestone.completedAt, Evidence.date, Goal.completedAt, ArchitectureDecision.decidedAt, ExperimentRun.runAt, Certification.issueDate                                                                                                                                                                                                                                                                  |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                                                                                                                                                                                |
| Owner                 | PEOS Engineering Analytics (src/modules/analytics/engineering-analytics.service.ts)                                                                                                                                                                                                                                                                                                                                        |
| Caveats               | Only records owned by the signed-in user are counted. • Counts recorded engineering outputs, not time spent — PEOS stores no time tracking. • Each event is counted once by its authoritative recorded date; skill demonstrations are represented by their evidence, never double-counted. • Period boundaries are whole calendar days in UTC. • Undated records are never counted and historical state is never inferred. |
| Value type / temporal | count / period                                                                                                                                                                                                                                                                                                                                                                                                             |
| Availability          | Available                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Drill-down target     | Per-domain record lists for the period (via engineering.activity_by_domain)                                                                                                                                                                                                                                                                                                                                                |
| Spec reference        | 08 Phase 9 — Engineering Analytics; 05 Analytics UX — comparison period                                                                                                                                                                                                                                                                                                                                                    |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                                                                                                                                                                                                             |

#### `engineering.activity_trend` — Engineering activity trend

| Field                 | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `engineering.activity_trend`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Name                  | Engineering activity trend                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Category              | engineering                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Definition            | Dated engineering events per calendar month inside the selected period (continuous series; months with no events are real zeros).                                                                                                                                                                                                                                                                                                                                                                |
| Formula               | `COUNT(events) GROUP BY month(event_date) WHERE event_date within period`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Source                | Project.completedAt, Milestone.completedAt, Evidence.date, Goal.completedAt, ArchitectureDecision.decidedAt, ExperimentRun.runAt, Certification.issueDate                                                                                                                                                                                                                                                                                                                                        |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Owner                 | PEOS Engineering Analytics (src/modules/analytics/engineering-analytics.service.ts)                                                                                                                                                                                                                                                                                                                                                                                                              |
| Caveats               | Only records owned by the signed-in user are counted. • Counts recorded engineering outputs, not time spent — PEOS stores no time tracking. • Each event is counted once by its authoritative recorded date; skill demonstrations are represented by their evidence, never double-counted. • Period boundaries are whole calendar days in UTC. • Undated records are never counted and historical state is never inferred. • Months without events are real zeros. At most 120 months are shown. |
| Value type / temporal | distribution / period                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Availability          | Available                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Drill-down target     | The month's engineering records, reached through each domain's list (see activity by domain) and the chart's data table                                                                                                                                                                                                                                                                                                                                                                          |
| Spec reference        | 05 Visualization Catalog — trends; 08 Phase 9                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

#### `engineering.activity_by_domain` — Engineering activity by domain

| Field                 | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `engineering.activity_by_domain`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Name                  | Engineering activity by domain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Category              | engineering                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Definition            | Distribution of the period's dated engineering events across domains — the mix of recorded engineering output (engineering focus).                                                                                                                                                                                                                                                                                                                                                                                  |
| Formula               | `COUNT(events in period) GROUP BY domain`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Source                | Project.completedAt, Milestone.completedAt, Evidence.date, Goal.completedAt, ArchitectureDecision.decidedAt, ExperimentRun.runAt, Certification.issueDate                                                                                                                                                                                                                                                                                                                                                           |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Owner                 | PEOS Engineering Analytics (src/modules/analytics/engineering-analytics.service.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Caveats               | Only records owned by the signed-in user are counted. • Counts recorded engineering outputs, not time spent — PEOS stores no time tracking. • Each event is counted once by its authoritative recorded date; skill demonstrations are represented by their evidence, never double-counted. • Period boundaries are whole calendar days in UTC. • Undated records are never counted and historical state is never inferred. • A distribution of recorded output, not a measure of effort, importance or proficiency. |
| Value type / temporal | distribution / period                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Availability          | Available                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Drill-down target     | Each domain drills into that domain's records dated in the period                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Spec reference        | 08 Phase 9 — engineering focus and distribution                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

#### `engineering.deployment_frequency` — Deployment frequency

| Field                 | Value                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `engineering.deployment_frequency`                                                                                                      |
| Name                  | Deployment frequency                                                                                                                    |
| Category              | engineering                                                                                                                             |
| Definition            | How often changes are deployed to production (DORA).                                                                                    |
| Formula               | `Requires a CI/CD or deployment integration`                                                                                            |
| Source                | Integrations (not yet built)                                                                                                            |
| Frequency             | Per integration sync                                                                                                                    |
| Owner                 | PEOS Engineering Analytics (src/modules/analytics/engineering-analytics.service.ts)                                                     |
| Caveats               | 05 Engineering Metrics: support DORA-style concepts only where data exists; do not fabricate metrics when integrations are unavailable. |
| Value type / temporal | count / period                                                                                                                          |
| Availability          | **Unavailable** — Future — requires an engineering integration (GitHub/CI/CD/issue tracker): PEOS has no deployment/CI integration.     |
| Drill-down target     | None                                                                                                                                    |
| Spec reference        | 05 Engineering Metrics — deployment frequency (DORA)                                                                                    |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                          |

#### `engineering.lead_time` — Lead time for changes

| Field                 | Value                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `engineering.lead_time`                                                                                                                          |
| Name                  | Lead time for changes                                                                                                                            |
| Category              | engineering                                                                                                                                      |
| Definition            | Time from commit to production (DORA).                                                                                                           |
| Formula               | `Requires a version-control and deployment integration`                                                                                          |
| Source                | Integrations (not yet built)                                                                                                                     |
| Frequency             | Per integration sync                                                                                                                             |
| Owner                 | PEOS Engineering Analytics (src/modules/analytics/engineering-analytics.service.ts)                                                              |
| Caveats               | 05 Engineering Metrics: support DORA-style concepts only where data exists; do not fabricate metrics when integrations are unavailable.          |
| Value type / temporal | count / period                                                                                                                                   |
| Availability          | **Unavailable** — Future — requires an engineering integration (GitHub/CI/CD/issue tracker): PEOS has no version-control/deployment integration. |
| Drill-down target     | None                                                                                                                                             |
| Spec reference        | 05 Engineering Metrics — lead time (DORA)                                                                                                        |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                                   |

#### `engineering.change_failure_rate` — Change failure rate

| Field                 | Value                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `engineering.change_failure_rate`                                                                                                         |
| Name                  | Change failure rate                                                                                                                       |
| Category              | engineering                                                                                                                               |
| Definition            | Share of deployments causing a failure in production (DORA).                                                                              |
| Formula               | `Requires deployment and incident integrations`                                                                                           |
| Source                | Integrations (not yet built)                                                                                                              |
| Frequency             | Per integration sync                                                                                                                      |
| Owner                 | PEOS Engineering Analytics (src/modules/analytics/engineering-analytics.service.ts)                                                       |
| Caveats               | 05 Engineering Metrics: support DORA-style concepts only where data exists; do not fabricate metrics when integrations are unavailable.   |
| Value type / temporal | ratio / period                                                                                                                            |
| Availability          | **Unavailable** — Future — requires an engineering integration (GitHub/CI/CD/issue tracker): PEOS has no deployment/incident integration. |
| Drill-down target     | None                                                                                                                                      |
| Spec reference        | 05 Engineering Metrics — change failure rate (DORA)                                                                                       |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                            |

#### `engineering.time_to_restore` — Time to restore service

| Field                 | Value                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `engineering.time_to_restore`                                                                                                             |
| Name                  | Time to restore service                                                                                                                   |
| Category              | engineering                                                                                                                               |
| Definition            | Time to recover from a production failure (DORA).                                                                                         |
| Formula               | `Requires an incident-management integration`                                                                                             |
| Source                | Integrations (not yet built)                                                                                                              |
| Frequency             | Per integration sync                                                                                                                      |
| Owner                 | PEOS Engineering Analytics (src/modules/analytics/engineering-analytics.service.ts)                                                       |
| Caveats               | 05 Engineering Metrics: support DORA-style concepts only where data exists; do not fabricate metrics when integrations are unavailable.   |
| Value type / temporal | count / period                                                                                                                            |
| Availability          | **Unavailable** — Future — requires an engineering integration (GitHub/CI/CD/issue tracker): PEOS has no incident-management integration. |
| Drill-down target     | None                                                                                                                                      |
| Spec reference        | 05 Engineering Metrics — time to restore (DORA)                                                                                           |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                            |

#### `engineering.technical_debt_trend` — Technical debt trend

| Field                 | Value                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `engineering.technical_debt_trend`                                                                                                      |
| Name                  | Technical debt trend                                                                                                                    |
| Category              | engineering                                                                                                                             |
| Definition            | Change in recorded technical debt over time.                                                                                            |
| Formula               | `Requires an engineering data source`                                                                                                   |
| Source                | Integrations (not yet built)                                                                                                            |
| Frequency             | Per integration sync                                                                                                                    |
| Owner                 | PEOS Engineering Analytics (src/modules/analytics/engineering-analytics.service.ts)                                                     |
| Caveats               | 05 Engineering Metrics: support DORA-style concepts only where data exists; do not fabricate metrics when integrations are unavailable. |
| Value type / temporal | count / period                                                                                                                          |
| Availability          | **Unavailable** — Future — requires an engineering integration (GitHub/CI/CD/issue tracker): No engineering integration exists yet.     |
| Drill-down target     | None                                                                                                                                    |
| Spec reference        | 00 §4 KPI strip — Technical Debt Trend                                                                                                  |
| Version               | v1 (introduced 2026-10-03, revised 2026-10-03)                                                                                          |

#### `github.repositories_total` — GitHub repositories

| Field                 | Value                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `github.repositories_total`                                                                                                                                                                                        |
| Name                  | GitHub repositories                                                                                                                                                                                                |
| Category              | github                                                                                                                                                                                                             |
| Definition            | Repositories accessible to the connected GitHub account (synced cache).                                                                                                                                            |
| Formula               | `COUNT(synced GitHub repositories)`                                                                                                                                                                                |
| Source                | GitHub /user/repos (IntegrationExternalResource cache)                                                                                                                                                             |
| Frequency             | Per explicit GitHub sync (never continuously monitored).                                                                                                                                                           |
| Owner                 | PEOS GitHub Intelligence (src/modules/integrations/github)                                                                                                                                                         |
| Caveats               | Only the signed-in user's connected GitHub account; owner-scoped. • Observed GitHub activity, not a productivity or quality measure. Computed from synced data; run Sync to refresh. Timestamps aggregated in UTC. |
| Value type / temporal | count / point_in_time                                                                                                                                                                                              |
| Availability          | Available                                                                                                                                                                                                          |
| Drill-down target     | GitHub repositories list                                                                                                                                                                                           |
| Spec reference        | 09.6 — GitHub repository explorer                                                                                                                                                                                  |
| Version               | v1 (introduced 2026-10-04, revised 2026-10-04)                                                                                                                                                                     |

#### `github.repositories_active` — Active repositories

| Field                 | Value                                                                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `github.repositories_active`                                                                                                                                                                                                                                                     |
| Name                  | Active repositories                                                                                                                                                                                                                                                              |
| Category              | github                                                                                                                                                                                                                                                                           |
| Definition            | Repositories with observed activity in the period: a commit in the period, or a push dated in the period.                                                                                                                                                                        |
| Formula               | `COUNT(repos WHERE last commit OR push within period)`                                                                                                                                                                                                                           |
| Source                | GitHub /user/repos.pushed_at, GitHubCommit.authoredAt                                                                                                                                                                                                                            |
| Frequency             | Per explicit GitHub sync (never continuously monitored).                                                                                                                                                                                                                         |
| Owner                 | PEOS GitHub Intelligence (src/modules/integrations/github)                                                                                                                                                                                                                       |
| Caveats               | Only the signed-in user's connected GitHub account; owner-scoped. • Observed GitHub activity, not a productivity or quality measure. Computed from synced data; run Sync to refresh. Timestamps aggregated in UTC. • Activity means observed GitHub events, never 'abandonment'. |
| Value type / temporal | count / period                                                                                                                                                                                                                                                                   |
| Availability          | Available                                                                                                                                                                                                                                                                        |
| Drill-down target     | GitHub repositories filtered to recent activity                                                                                                                                                                                                                                  |
| Spec reference        | 09.6 — repository activity                                                                                                                                                                                                                                                       |
| Version               | v1 (introduced 2026-10-04, revised 2026-10-04)                                                                                                                                                                                                                                   |

#### `github.repositories_by_visibility` — Repositories by visibility

| Field                 | Value                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `github.repositories_by_visibility`                                                                                                                                                                                |
| Name                  | Repositories by visibility                                                                                                                                                                                         |
| Category              | github                                                                                                                                                                                                             |
| Definition            | Distribution of repositories by public/private visibility.                                                                                                                                                         |
| Formula               | `COUNT(repos) GROUP BY visibility`                                                                                                                                                                                 |
| Source                | GitHub /user/repos.private                                                                                                                                                                                         |
| Frequency             | Per explicit GitHub sync (never continuously monitored).                                                                                                                                                           |
| Owner                 | PEOS GitHub Intelligence (src/modules/integrations/github)                                                                                                                                                         |
| Caveats               | Only the signed-in user's connected GitHub account; owner-scoped. • Observed GitHub activity, not a productivity or quality measure. Computed from synced data; run Sync to refresh. Timestamps aggregated in UTC. |
| Value type / temporal | distribution / point_in_time                                                                                                                                                                                       |
| Availability          | Available                                                                                                                                                                                                          |
| Drill-down target     | GitHub repositories filtered by visibility                                                                                                                                                                         |
| Spec reference        | 09.6 — repository portfolio                                                                                                                                                                                        |
| Version               | v1 (introduced 2026-10-04, revised 2026-10-04)                                                                                                                                                                     |

#### `github.repositories_by_type` — Repositories by type

| Field                 | Value                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `github.repositories_by_type`                                                                                                                                                                                      |
| Name                  | Repositories by type                                                                                                                                                                                               |
| Category              | github                                                                                                                                                                                                             |
| Definition            | Distribution of repositories by original vs fork.                                                                                                                                                                  |
| Formula               | `COUNT(repos) GROUP BY fork`                                                                                                                                                                                       |
| Source                | GitHub /user/repos.fork                                                                                                                                                                                            |
| Frequency             | Per explicit GitHub sync (never continuously monitored).                                                                                                                                                           |
| Owner                 | PEOS GitHub Intelligence (src/modules/integrations/github)                                                                                                                                                         |
| Caveats               | Only the signed-in user's connected GitHub account; owner-scoped. • Observed GitHub activity, not a productivity or quality measure. Computed from synced data; run Sync to refresh. Timestamps aggregated in UTC. |
| Value type / temporal | distribution / point_in_time                                                                                                                                                                                       |
| Availability          | Available                                                                                                                                                                                                          |
| Drill-down target     | GitHub repositories filtered by type                                                                                                                                                                               |
| Spec reference        | 09.6 — repository portfolio                                                                                                                                                                                        |
| Version               | v1 (introduced 2026-10-04, revised 2026-10-04)                                                                                                                                                                     |

#### `github.repositories_by_activity` — Repositories by activity recency

| Field                 | Value                                                                                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `github.repositories_by_activity`                                                                                                                                                                                                                                             |
| Name                  | Repositories by activity recency                                                                                                                                                                                                                                              |
| Category              | github                                                                                                                                                                                                                                                                        |
| Definition            | Distribution of repositories by recency of last observed activity: active (≤30d), 30+, 90+, 180+ days.                                                                                                                                                                        |
| Formula               | `COUNT(repos) GROUP BY bucket(now - max(pushed_at, last commit))`                                                                                                                                                                                                             |
| Source                | GitHub /user/repos.pushed_at, GitHubCommit.authoredAt                                                                                                                                                                                                                         |
| Frequency             | Per explicit GitHub sync (never continuously monitored).                                                                                                                                                                                                                      |
| Owner                 | PEOS GitHub Intelligence (src/modules/integrations/github)                                                                                                                                                                                                                    |
| Caveats               | Only the signed-in user's connected GitHub account; owner-scoped. • Observed GitHub activity, not a productivity or quality measure. Computed from synced data; run Sync to refresh. Timestamps aggregated in UTC. • Neutral recency, never a judgement about the repository. |
| Value type / temporal | distribution / point_in_time                                                                                                                                                                                                                                                  |
| Availability          | Available                                                                                                                                                                                                                                                                     |
| Drill-down target     | GitHub repositories filtered by activity bucket                                                                                                                                                                                                                               |
| Spec reference        | 09.6 — inactive repositories                                                                                                                                                                                                                                                  |
| Version               | v1 (introduced 2026-10-04, revised 2026-10-04)                                                                                                                                                                                                                                |

#### `github.commits` — GitHub commits

| Field                 | Value                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `github.commits`                                                                                                                                                                                                                                                         |
| Name                  | GitHub commits                                                                                                                                                                                                                                                           |
| Category              | github                                                                                                                                                                                                                                                                   |
| Definition            | Commits authored in the period across synced repositories.                                                                                                                                                                                                               |
| Formula               | `COUNT(GitHubCommit WHERE authored_at within period)`                                                                                                                                                                                                                    |
| Source                | GitHub /repos/:repo/commits (GitHubCommit projection)                                                                                                                                                                                                                    |
| Frequency             | Per explicit GitHub sync (never continuously monitored).                                                                                                                                                                                                                 |
| Owner                 | PEOS GitHub Intelligence (src/modules/integrations/github)                                                                                                                                                                                                               |
| Caveats               | Only the signed-in user's connected GitHub account; owner-scoped. • Observed GitHub activity, not a productivity or quality measure. Computed from synced data; run Sync to refresh. Timestamps aggregated in UTC. • Bounded by the sync window and per-repo commit cap. |
| Value type / temporal | count / period                                                                                                                                                                                                                                                           |
| Availability          | Available                                                                                                                                                                                                                                                                |
| Drill-down target     | GitHub analytics (commit trend)                                                                                                                                                                                                                                          |
| Spec reference        | 09.6 — commit intelligence                                                                                                                                                                                                                                               |
| Version               | v1 (introduced 2026-10-04, revised 2026-10-04)                                                                                                                                                                                                                           |

#### `github.commit_trend` — Commit trend

| Field                 | Value                                                                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `github.commit_trend`                                                                                                                                                                                                                     |
| Name                  | Commit trend                                                                                                                                                                                                                              |
| Category              | github                                                                                                                                                                                                                                    |
| Definition            | Commits per day (≤92-day periods) or per month, authored within the period.                                                                                                                                                               |
| Formula               | `COUNT(GitHubCommit) GROUP BY day                                                                                                                                                                                                         | month(authored_at)` |
| Source                | GitHubCommit.authoredAt                                                                                                                                                                                                                   |
| Frequency             | Per explicit GitHub sync (never continuously monitored).                                                                                                                                                                                  |
| Owner                 | PEOS GitHub Intelligence (src/modules/integrations/github)                                                                                                                                                                                |
| Caveats               | Only the signed-in user's connected GitHub account; owner-scoped. • Observed GitHub activity, not a productivity or quality measure. Computed from synced data; run Sync to refresh. Timestamps aggregated in UTC. • At most 120 buckets. |
| Value type / temporal | distribution / period                                                                                                                                                                                                                     |
| Availability          | Available                                                                                                                                                                                                                                 |
| Drill-down target     | The bucket's commits in GitHub analytics                                                                                                                                                                                                  |
| Spec reference        | 09.6 — commit trend                                                                                                                                                                                                                       |
| Version               | v1 (introduced 2026-10-04, revised 2026-10-04)                                                                                                                                                                                            |

#### `github.commits_by_repository` — Commits by repository

| Field                 | Value                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `github.commits_by_repository`                                                                                                                                                                                                                                      |
| Name                  | Commits by repository                                                                                                                                                                                                                                               |
| Category              | github                                                                                                                                                                                                                                                              |
| Definition            | Commit volume per repository in the period (top repositories).                                                                                                                                                                                                      |
| Formula               | `COUNT(GitHubCommit) GROUP BY repository`                                                                                                                                                                                                                           |
| Source                | GitHubCommit.repoExternalId                                                                                                                                                                                                                                         |
| Frequency             | Per explicit GitHub sync (never continuously monitored).                                                                                                                                                                                                            |
| Owner                 | PEOS GitHub Intelligence (src/modules/integrations/github)                                                                                                                                                                                                          |
| Caveats               | Only the signed-in user's connected GitHub account; owner-scoped. • Observed GitHub activity, not a productivity or quality measure. Computed from synced data; run Sync to refresh. Timestamps aggregated in UTC. • Volume, never a ranking of repository quality. |
| Value type / temporal | distribution / period                                                                                                                                                                                                                                               |
| Availability          | Available                                                                                                                                                                                                                                                           |
| Drill-down target     | The repository's detail page                                                                                                                                                                                                                                        |
| Spec reference        | 09.6 — most active repositories                                                                                                                                                                                                                                     |
| Version               | v1 (introduced 2026-10-04, revised 2026-10-04)                                                                                                                                                                                                                      |

#### `github.active_days` — Active commit days

| Field                 | Value                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key                   | `github.active_days`                                                                                                                                                                                               |
| Name                  | Active commit days                                                                                                                                                                                                 |
| Category              | github                                                                                                                                                                                                             |
| Definition            | Distinct UTC days on which a commit was authored in the period.                                                                                                                                                    |
| Formula               | `COUNT(DISTINCT day(authored_at)) within period`                                                                                                                                                                   |
| Source                | GitHubCommit.authoredAt                                                                                                                                                                                            |
| Frequency             | Per explicit GitHub sync (never continuously monitored).                                                                                                                                                           |
| Owner                 | PEOS GitHub Intelligence (src/modules/integrations/github)                                                                                                                                                         |
| Caveats               | Only the signed-in user's connected GitHub account; owner-scoped. • Observed GitHub activity, not a productivity or quality measure. Computed from synced data; run Sync to refresh. Timestamps aggregated in UTC. |
| Value type / temporal | count / period                                                                                                                                                                                                     |
| Availability          | Available                                                                                                                                                                                                          |
| Drill-down target     | GitHub analytics (commit trend)                                                                                                                                                                                    |
| Spec reference        | 09.6 — commit cadence                                                                                                                                                                                              |
| Version               | v1 (introduced 2026-10-04, revised 2026-10-04)                                                                                                                                                                     |

#### `github.language_distribution` — Repositories by primary language

| Field                 | Value                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `github.language_distribution`                                                                                                                                                                                                                                                                                         |
| Name                  | Repositories by primary language                                                                                                                                                                                                                                                                                       |
| Category              | github                                                                                                                                                                                                                                                                                                                 |
| Definition            | Distribution of repositories by GitHub-reported primary language.                                                                                                                                                                                                                                                      |
| Formula               | `COUNT(repos) GROUP BY primary language`                                                                                                                                                                                                                                                                               |
| Source                | GitHub /user/repos.language                                                                                                                                                                                                                                                                                            |
| Frequency             | Per explicit GitHub sync (never continuously monitored).                                                                                                                                                                                                                                                               |
| Owner                 | PEOS GitHub Intelligence (src/modules/integrations/github)                                                                                                                                                                                                                                                             |
| Caveats               | Only the signed-in user's connected GitHub account; owner-scoped. • Observed GitHub activity, not a productivity or quality measure. Computed from synced data; run Sync to refresh. Timestamps aggregated in UTC. • Primary language is GitHub's heuristic; byte-level composition is shown per repository, not here. |
| Value type / temporal | distribution / point_in_time                                                                                                                                                                                                                                                                                           |
| Availability          | Available                                                                                                                                                                                                                                                                                                              |
| Drill-down target     | GitHub repositories filtered by language                                                                                                                                                                                                                                                                               |
| Spec reference        | 09.6 — language intelligence                                                                                                                                                                                                                                                                                           |
| Version               | v1 (introduced 2026-10-04, revised 2026-10-04)                                                                                                                                                                                                                                                                         |
