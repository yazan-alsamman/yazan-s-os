# PEOS Metric Catalogue (Phase 2)

Generated from `src/modules/analytics/metric-catalogue.ts`, which is the source of truth (ADR 0019).
The catalogue is validated by a strict Zod schema when it is loaded, served read-only at
`GET /api/v1/analytics/metrics`, and shown in the app at `/command-center/metrics` and in each
KPI's definition drawer.

- **28 metrics**: 19 available, 9 unavailable (with the reason and the phase that unlocks them).
- Every metric counts only records owned by the signed-in user.
- Frequency: computed live on request. Nothing is cached, pre-aggregated or estimated.
- Periods are whole UTC calendar days, inclusive. Presets: 30, 90 or 365 days, all time, or a custom range.
- Result states: `ok`, `zero`, `no_data`, `insufficient_data`, `unavailable` (ADR 0019).
- To regenerate this file, render `METRIC_CATALOGUE` into one table per metric. Any catalogue change bumps `version` and `revised`.

## Summary

| Key                                | Name                           | Availability                           | Drill-down                                                   |
| ---------------------------------- | ------------------------------ | -------------------------------------- | ------------------------------------------------------------ |
| projects.total                     | Projects                       | available                              | Projects list with the same filters                          |
| projects.active                    | Active projects                | available                              | Projects list filtered to the active lifecycle group         |
| projects.production                | Production systems             | available                              | Projects list filtered to the production lifecycle group     |
| projects.completed_in_period       | Projects completed             | available                              | Projects list filtered to completion dates in the period     |
| projects.health_distribution       | Project health                 | available                              | Projects list filtered to the selected health state          |
| projects.lifecycle_distribution    | Projects by lifecycle status   | available                              | Projects list filtered to the selected status                |
| evidence.total                     | Evidence items                 | available                              | Evidence list with the same filters                          |
| evidence.verified                  | Verified evidence              | available                              | Evidence list filtered to verified                           |
| evidence.velocity                  | Evidence velocity              | available                              | Evidence list filtered to verified items dated in the period |
| evidence.undated                   | Undated evidence               | available                              | Evidence list filtered to undated items                      |
| skills.total                       | Skills                         | available                              | Skills list                                                  |
| skills.active                      | Active skills                  | available                              | Skills list filtered to active                               |
| skills.with_target                 | Skills with a target level     | available                              | Skills list filtered to skills with a target                 |
| skills.with_evidence               | Skills with evidence           | available                              | Skills list filtered to skills with evidence                 |
| skills.without_evidence            | Active skills without evidence | available                              | Skills list filtered to active skills without evidence       |
| skills.by_category                 | Skills by category             | available                              | Skills list filtered to the selected category                |
| certifications.total               | Certifications                 | available                              | Certifications list                                          |
| certifications.expiry_distribution | Certification expiry           | available                              | Certifications list filtered to the selected expiry state    |
| certifications.expiring            | Certifications expiring        | available                              | Certifications list filtered to expiring                     |
| goals.active                       | Active goals                   | Phase 5 — Goals & Roadmap              | —                                                            |
| skills.coverage                    | Skill coverage                 | Phase 4 — Skills & Career Intelligence | —                                                            |
| skills.critical_gaps               | Critical skill gaps            | Phase 4 — Skills & Career Intelligence | —                                                            |
| skills.freshness                   | Skill freshness                | Phase 4 — Skills & Career Intelligence | —                                                            |
| projects.delivery_rate             | Delivery rate                  | Phase 3 — Project Intelligence         | —                                                            |
| evidence.production_ratio          | Production evidence ratio      | Specification decision required        | —                                                            |
| ai.experiments                     | AI experiments                 | Phase 6 — AI Lab                       | —                                                            |
| architecture.decisions             | Architecture decisions         | Phase 7 — Architecture Intelligence    | —                                                            |
| engineering.technical_debt_trend   | Technical debt trend           | Phase 9 — Engineering Analytics        | —                                                            |

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

| Field                 | Value                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.coverage`                                                                                                                                                                                          |
| Name                  | Skill coverage                                                                                                                                                                                             |
| Category              | skills                                                                                                                                                                                                     |
| Definition            | Percentage of target skills with recent evidence.                                                                                                                                                          |
| Formula               | `COUNT(target skills with evidence in the recency window) / COUNT(target skills)`                                                                                                                          |
| Source                | Skill.targetLevel, SkillEvidence, Evidence.date                                                                                                                                                            |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                                |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                                                                                                                    |
| Caveats               | Requires a defined recency window (skill freshness).                                                                                                                                                       |
| Value type / temporal | count / point_in_time                                                                                                                                                                                      |
| Availability          | **Unavailable** — Phase 4 — Skills & Career Intelligence: “Recent” is not defined by the specification; skill freshness is Phase 4 work. “Skills with evidence” is shown instead, without a recency claim. |
| Drill-down target     | None                                                                                                                                                                                                       |
| Spec reference        | 05 Career Metrics — Skill Coverage; 00 §4 KPI strip                                                                                                                                                        |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                                                                                             |

#### `skills.critical_gaps` — Critical skill gaps

| Field                 | Value                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.critical_gaps`                                                                                           |
| Name                  | Critical skill gaps                                                                                              |
| Category              | skills                                                                                                           |
| Definition            | Target skills whose evidence-derived level is far below target.                                                  |
| Formula               | `Requires evidence-derived current levels`                                                                       |
| Source                | Skill, SkillEvidence                                                                                             |
| Frequency             | On request — computed live from the database when the Command Center loads.                                      |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                          |
| Caveats               | Current skill levels are not stored and are not yet derived.                                                     |
| Value type / temporal | count / point_in_time                                                                                            |
| Availability          | **Unavailable** — Phase 4 — Skills & Career Intelligence: Gap analysis needs evidence-derived levels (ADR 0013). |
| Drill-down target     | None                                                                                                             |
| Spec reference        | 00 §4 KPI strip — Critical Skill Gaps                                                                            |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                   |

#### `skills.freshness` — Skill freshness

| Field                 | Value                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                   | `skills.freshness`                                                                                                                                                                           |
| Name                  | Skill freshness                                                                                                                                                                              |
| Category              | skills                                                                                                                                                                                       |
| Definition            | Time since a skill was last demonstrated.                                                                                                                                                    |
| Formula               | `today − MAX(evidence date) per skill`                                                                                                                                                       |
| Source                | SkillEvidence, Evidence.date                                                                                                                                                                 |
| Frequency             | On request — computed live from the database when the Command Center loads.                                                                                                                  |
| Owner                 | PEOS Skills domain (src/modules/skills)                                                                                                                                                      |
| Caveats               | Freshness scoring and decay are Phase 4 intelligence.                                                                                                                                        |
| Value type / temporal | count / point_in_time                                                                                                                                                                        |
| Availability          | **Unavailable** — Phase 4 — Skills & Career Intelligence: Freshness thresholds are not specified. The Command Center shows each skill's latest linked evidence date as a plain fact instead. |
| Drill-down target     | None                                                                                                                                                                                         |
| Spec reference        | 05 Career Metrics — Skill Freshness                                                                                                                                                          |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                                                                                                                               |

#### `projects.delivery_rate` — Delivery rate

| Field                 | Value                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| Key                   | `projects.delivery_rate`                                                           |
| Name                  | Delivery rate                                                                      |
| Category              | projects                                                                           |
| Definition            | Completed milestones divided by planned milestones.                                |
| Formula               | `COUNT(completed milestones) / COUNT(planned milestones)`                          |
| Source                | Milestone (not yet modelled)                                                       |
| Frequency             | On request — computed live from the database when the Command Center loads.        |
| Owner                 | PEOS Projects domain (src/modules/projects)                                        |
| Caveats               | Milestones do not exist yet.                                                       |
| Value type / temporal | count / period                                                                     |
| Availability          | **Unavailable** — Phase 3 — Project Intelligence: Milestones are not modelled yet. |
| Drill-down target     | None                                                                               |
| Spec reference        | 05 Project Metrics — Delivery Rate                                                 |
| Version               | v1 (introduced 2026-10-02, revised 2026-10-02)                                     |

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
