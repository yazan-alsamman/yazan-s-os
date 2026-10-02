# PEOS — Phase 2 Command Center Report

Date: 2026-10-02/03 · Repository: `Yazan_Personal_Engineering_OS_Spec` (dedicated repo, branch `master`, no remote)

## 1. Executive Summary

Phase 2 replaces the "Not available yet" placeholder with a working **Command Center**. Every
number is computed live from the signed-in user's own records.

- **Catalogue first.** A governed metric catalogue was built before any KPI was shown:
  - 28 metrics: 19 available, 9 unavailable, each with its reason and planned phase.
  - Every metric has a name, definition, formula, source, frequency, owner, caveats, availability
    and drill-down target.
  - This resolves specification gap C7 (ADR 0019).
- **The dashboard** has 7 KPIs and 7 widgets:
  - project health
  - needs attention
  - evidence over time
  - evidence timeline
  - skill snapshot
  - certification expiry
  - recent activity
- **Filters** live in the URL.
- **Drill-down** goes to filtered lists whose totals match each KPI exactly (verified by an
  integration test).
- **Definitions are discoverable** in a drawer and on a catalogue page.
- **Nothing is faked:**
  - Each widget shows its data source and calculation time.
  - Charts are accessible, and every chart has a data table and CSV export.
  - States are explicit: no data, insufficient data and unavailable are never shown as 0.
  - Comparisons are never invented.

**Security.** Four new owner-scoped, rate-limited endpoints under `/api/v1/analytics`. The user's
identity comes only from the session.

**Testing.** All validation gates pass: 141 unit, 70 integration and 28 E2E tests, with axe scans
showing 0 violations.

**Schema.** No changes and no migrations.

**Readiness.** Phase 3 is **READY WITH CONDITIONS** (§25).

## 2. Scope Implemented

| Requirement (Phase 2 prompt)                      | Implemented                                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metric catalogue first, with governance fields    | `src/modules/analytics/metric-catalogue.ts`: strict Zod validation at load, versioned. 28 metrics. Generated doc `docs/architecture/metric-catalogue.md` |
| KPI layer from real persisted data only           | `dashboard.service.ts`: Prisma `count`/`groupBy` plus one parameterised `$queryRaw`. No seeding or estimates                                             |
| Project health from the manual field only         | `projects.health_distribution` uses `Project.healthStatus`. The computed score is deferred to Phase 3                                                    |
| Recent activity from the audit log, as a safe DTO | `activity.service.ts` (ADR 0021)                                                                                                                         |
| Evidence timeline by real dates, undated explicit | `timeline.service.ts`: undated items are counted and linked to `/evidence?dated=false`                                                                   |
| Factual skill snapshot, no Phase 4 intelligence   | Counts, categories and top skills by linked evidence. No levels, gaps, coverage or freshness                                                             |
| Certification expiry reuses Phase 1 logic         | `expiryWhere` / `EXPIRY_WINDOW_DAYS` from the certifications module                                                                                      |
| URL-synced filters and drill-down                 | `filter-bar.tsx`, `use-dashboard.ts`, `drilldown.ts`, plus new list filters (ADR 0020)                                                                   |
| Discoverable definitions, source and freshness    | Definition drawer on every KPI and chart. `/command-center/metrics`. Source and "Calculated …" shown on every widget                                     |
| No fake comparisons                               | `comparisonFor()`: shows the previous value only when history exists before the period. Otherwise "Comparison unavailable: …"                            |
| Accessible ECharts charts with data tables        | `EChart` + `ChartCard` (role=img summary, decals, data table, CSV)                                                                                       |
| Responsive, light/dark                            | Grid layouts from 375 px to 2xl. `--chart-*` tokens for both themes                                                                                      |
| Empty and first-run states                        | First-run panel. "—" values with reasons. Empty state for each section                                                                                   |
| Owner-scoped, rate-limited `/api/v1` endpoints    | `metrics`, `dashboard`, `activity`, `evidence-timeline`, each with `RateLimits.analytics` (120/min)                                                      |
| Tests, docs, ADRs, report                         | §18, §24, this report                                                                                                                                    |

## 3. Metric Catalogue

All 28 metrics follow, generated from the code catalogue (v1, introduced 2026-10-02). For
`available` metrics, "Drill-down target" names the filtered list; the exact URL mapping is in §12.
Unavailable metrics are never computed: `metricResult()` throws if code tries.

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

## 4. Metric Architecture

- **Catalogue in code** (ADR 0019): `metricDefinitionSchema` is a strict Zod object.
  - Keys are dotted lower-case.
  - Text fields must be non-blank; `source` and `caveats` need at least one entry each.
  - `availability` is a discriminated union with `reason` and `plannedPhase` on unavailable
    metrics.
  - Every metric carries `version`, `introduced` and `revised`.
  - It is validated when the module loads and then frozen. Unit tests check governance
    completeness, unique keys, and that every `00` §4 KPI is catalogued.
- **Periods** (`period.ts`): presets are 30, 90 and 365 days, all time, or a custom range (at most
  20 years). Days are UTC calendar days, inclusive. `previousPeriod` returns the preceding period
  of the same length. `dateWhere` handles `@db.Date` columns; `timestampWhere` handles timestamps
  (end day + 1, exclusive).
- **Result contract** (`metric-result.ts`): `MetricResult` has the fields `value`, `state`,
  `stateReason`, `temporal`, `period`, `comparison`, `breakdown`, `filtersApplied` and `source`.
  - States are `ok`, `zero`, `no_data` (value `null`), `insufficient_data` (value `null`) and
    `unavailable` (never computed).
  - Point-in-time metrics never carry a period or a comparison.
- **Comparisons** (`comparisonFor`):
  - `available` (the previous value) only when the period is bounded **and** records exist before
    it starts.
  - Otherwise `unavailable` with a reason, or `not_applicable` for all time.
  - No arrows, percentages or good/bad colouring.
- **Calculators** (`dashboard.service.ts`): all queries run in parallel with `Promise.all`, and
  every `where` includes `userId`.
  - Distributions keep zero buckets in a stable order.
  - The monthly evidence series is one `$queryRaw` with `date_trunc('month', date)`, built with
    `Prisma.sql`/`Prisma.join`. Missing months are zero-filled, capped at 120 months, with a
    `truncated` flag.

## 5. Dashboard Architecture

- **Server:** `GET /api/v1/analytics/dashboard` → `defineUserRoute` (session, rate limit
  `analytics`) → `dashboardFiltersSchema` → `createDashboardService(db).dashboard(ctx, filters)`.
  The response contains:
  - `calculatedAt` and `period`
  - per-section `filters` labels
  - `recordCounts` and `hasAnyData`
  - `kpis[7]`
  - the `projects`, `evidence`, `skills` and `certifications` sections
- **Client:** `CommandCenter` (`src/components/command-center/command-center.tsx`):
  - `useDashboardFilters()` reads the URL, and `useDashboard()` runs a TanStack Query with
    `staleTime: 0` and `keepPreviousData`. It is disabled while a custom range is incomplete.
  - The activity and timeline widgets fetch their own paginated endpoints and are keyed by the
    filter set, so they reset to page 1 when filters change.
  - `MetricDefinitionProvider` opens the definition drawer from any widget.
  - The page keeps the Phase 0 System status as a collapsed `<details>`.
- **Charts:** `EChart` lazy-loads a tree-shaken ECharts 6 (Bar, Grid, Tooltip, Legend and Aria
  components, SVG renderer).
  - Colours come from the `--chart-*` CSS tokens; the chart is rebuilt when the theme or `dataKey`
    changes.
  - `ResizeObserver` handles resizing, and a click on a bar drills down.
  - `ChartCard` provides the header (title, interpretation, source/period/calculated meta,
    definition button), the empty state, a toggleable data table with links, and CSV download.

## 6. Dashboard Widgets

| Widget               | Content                                                                                                                                   | Period-aware        | Filters applied                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------- |
| KPI strip (7)        | Active projects, Projects completed, Production systems, Evidence items, Evidence velocity, Skills with evidence, Certifications expiring | completed, velocity | project, evidence, skill category |
| Project health       | Bar chart of 4 buckets plus interpretation ("N of M projects are at risk or blocked")                                                     | No (current)        | project status/health             |
| Needs attention      | Blocked or at-risk projects (not archived) and expired or expiring certifications, up to 10 each                                          | No                  | project filters                   |
| Evidence over time   | Stacked monthly bars, verified vs unverified, by evidence date                                                                            | Yes                 | evidence filters                  |
| Evidence timeline    | Dated evidence, newest first, related records (≤ 3 per kind), 10 per page, undated count                                                  | Yes                 | evidence filters                  |
| Skill snapshot       | 5 facts, category chart (≤ 12 + Other + Uncategorised), top 10 skills by linked evidence with latest date                                 | No                  | skill category                    |
| Certification expiry | Valid / expiring (90 days) / expired / no expiry date, excluding revoked                                                                  | No                  | —                                 |
| Recent activity      | The caller's audit log (no `auth.*`), 15 per page, links only to existing records                                                         | Yes                 | date range                        |

There's also a note listing the 6 specified KPIs that can't be computed yet, with a "see why" link
to the catalogue.

## 7. Project Health

- **Source:** `Project.healthStatus`, the manual field with values `not_assessed`, `on_track`,
  `at_risk` and `blocked`. No computed score: schedule, blocker and milestone health is Phase 3
  (stated under the chart).
- **Buckets:** all 4 are always present, including zeros. Projects with no assessment count as
  "Not assessed" and are never guessed.
- **Interpretation:** "_N_ of _M_ projects are at risk or blocked; _K_ not assessed."
- **Needs attention:** lists blocked and at-risk projects that are not archived.
- **Drill-down:** each bucket opens `/projects?healthStatus=…`, keeping the status filter. Checked
  by E2E ("Blocked" → only the blocked project).

## 8. Recent Activity

- **Source:** `audit_logs` where `actor_id` is the session user, excluding `auth.*`, within the
  date range, ordered by `created_at` then `id` (descending). Page size is at most 50; the UI uses
  15 per page.
- **DTO:** `{id, at, entityType, verb, summary, label, href, deleted}`. Raw before/after snapshots
  are never returned.
- **Labels:** taken only from a per-entity whitelist of name/title fields. Relationship-only
  changes use the record's **current** name, read with an owner-scoped lookup. Phase 2 fixed this:
  the label previously fell back to a generic "Open".
- **Links:** emitted only when the record still exists and is owned by the caller, checked with
  one batched query per entity type. Records that no longer exist are marked "deleted" and not
  linked.

## 9. Evidence Timeline

- **Ordering:** by `Evidence.date` (the date the user recorded), then `createdAt`, then `id`.
  `createdAt` is never used as the date.
- **Undated evidence:** excluded and stated, e.g. "1 evidence item has no date and is not
  shown. Review undated evidence" → `/evidence?dated=false`.
- **Filters:** the date range (all time means any dated item) plus type, verification and
  provenance.
- **Related records:** up to 3 per kind (project, skill, certification, experience), each with an
  owner-scoped link, plus total counts.
- **Chart:** "Evidence over time" uses the same date rule. Each month drills to
  `/evidence?dateFrom=…&dateTo=…`.

## 10. Skill Snapshot

This is factual only; no Phase 4 intelligence. The facts are:

- total skills
- active skills
- skills with a target level
- skills with evidence
- active skills without evidence

There's also a category distribution, and the top 10 skills by linked-evidence count with their
latest evidence date.

The snapshot never shows a **current level, gaps, coverage, freshness or a trend**. The UI
says: "Levels are not shown: evidence-derived levels arrive in Phase 4." Every fact drills to
`/skills` with the matching filter. The "Other categories" and "Uncategorised" buckets are not
linked, because no single filter reproduces them.

## 11. Filters

| Filter                | URL key               | Values                                                   | Affects                                                 |
| --------------------- | --------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Date range            | `range`, `from`, `to` | 30d, 90d (default, omitted), 365d, all, custom           | completed, velocity, evidence chart, timeline, activity |
| Project status        | `projectStatus`       | the 8 lifecycle statuses                                 | project KPIs and charts                                 |
| Project health        | `projectHealth`       | 4 states                                                 | project KPIs and charts                                 |
| Evidence type         | `evidenceType`        | evidence types                                           | evidence KPIs, chart and timeline                       |
| Evidence verification | `evidenceVerified`    | true/false                                               | evidence KPIs, chart and timeline                       |
| Evidence provenance   | `evidenceOrigin`      | manual/import                                            | evidence KPIs, chart and timeline                       |
| Skill category        | `skillCategory`       | the user's categories (from `/api/v1/skills/categories`) | skill facts and chart                                   |

- **Validation:** server-side. Invalid values return 400. A custom range needs both dates, in
  order, spanning at most 20 years. Identity keys are stripped.
- **In the UI:** a "Filtered" badge and the meta line show which filters applied to each widget.
  "Clear filters" resets to the default.
- **Persistence:** filters survive a reload and are shareable (E2E).

## 12. Drill-down

| Widget / KPI                   | Destination                                                                                      | Filters preserved                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Active projects                | `/projects?lifecycle=active`                                                                     | projectStatus → `status`, projectHealth → `healthStatus` |
| Production systems             | `/projects?lifecycle=production`                                                                 | same                                                     |
| Projects completed             | `/projects?completedFrom=<from or 1900-01-01>&completedTo=<to>`                                  | same                                                     |
| Projects (total)               | `/projects`                                                                                      | same                                                     |
| Project health bucket          | `/projects?healthStatus=<bucket>`                                                                | projectStatus                                            |
| Lifecycle bucket (API only)    | `/projects?status=<bucket>`: mapped in `bucketHref`; no lifecycle widget is rendered in Phase 2  | projectHealth                                            |
| Needs attention item           | `/projects/:id`, `/certifications/:id`                                                           | —                                                        |
| Evidence items                 | `/evidence`                                                                                      | type, verified, origin                                   |
| Verified evidence              | `/evidence?verified=true`                                                                        | type, origin                                             |
| Evidence velocity              | `/evidence?verified=true&dateFrom&dateTo` (all time: `dated=true`)                               | type, origin                                             |
| Evidence month bar / table row | `/evidence?dateFrom=<max(month start, period start)>&dateTo=<min(month end, period end)>`        | type, verified, origin                                   |
| Undated evidence               | `/evidence?dated=false`                                                                          | type, verified, origin                                   |
| Timeline item / related        | `/evidence/:id`, `/projects/:id`, `/skills/:id`, `/certifications/:id`, `/career/experience/:id` | —                                                        |
| Skills / active / with target  | `/skills`, `?active=true`, `?hasTarget=true`                                                     | category                                                 |
| Skills with / without evidence | `/skills?hasEvidence=true` · `?active=true&hasEvidence=false`                                    | category                                                 |
| Skill category bar             | `/skills?category=<name>` (none for Other/Uncategorised)                                         | —                                                        |
| Top skill row                  | `/skills/:id`                                                                                    | —                                                        |
| Certifications expiring        | `/certifications?expiry=expiring&current=true&sort=expiryDate`                                   | —                                                        |
| Certification expiry bucket    | `/certifications?expiry=<bucket>&current=true&sort=expiryDate`                                   | —                                                        |
| Activity item                  | the record's page (only if it still exists)                                                      | —                                                        |

Lists show drill-down parameters as removable "Also filtered by" chips. In
`tests/integration/analytics.int.test.ts`, each of the 7 KPIs plus the verified and undated
metrics is checked to equal the drilled list's `page.total`. E2E covers three drill-downs end to
end.

## 13. API Surface

New endpoints. All are `GET`, require a session, are owner-scoped, rate-limited at `analytics`
(120 requests per minute per user), and return the standard error shape.

| Path                                  | Query                                               | Returns                                                |
| ------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `/api/v1/analytics/metrics`           | —                                                   | `{ data: MetricDefinition[28] }`                       |
| `/api/v1/analytics/dashboard`         | `dashboardFiltersSchema`                            | `{ data: DashboardDto }`                               |
| `/api/v1/analytics/activity`          | `range/from/to`, `page`, `pageSize ≤ 50`            | `{ data: ActivityItem[], page, period }`               |
| `/api/v1/analytics/evidence-timeline` | range and evidence filters, `page`, `pageSize ≤ 50` | `{ data: TimelineItem[], page, undatedCount, period }` |

New optional, backwards-compatible list filters (ADR 0020):

- `/projects`: `lifecycle`, `completedFrom`, `completedTo`
- `/evidence`: `dated`
- `/skills`: `hasEvidence`
- `/certifications`: `current`

Documented in `docs/architecture/api.md`.

## 14. Database Changes

**None.** Phase 2 adds no models, columns, indexes or migrations. The existing indexes already
cover the queries: `(user_id, status)`, `(user_id, date)`, `(user_id, expiry_date)`,
`(user_id, category)` and `audit_logs(actor_id, created_at)`.

Migration-from-zero was re-verified on a fresh database (§19). No data was seeded.

## 15. Security

- **Identity:** taken only from the session.
  - No analytics schema has an identity field, and Zod strips unknown keys.
  - HTTP tests with two users show that injected `userId`, `ownerId` and `user_id` are ignored,
    and Bob's responses never contain Alice's data.
  - The catalogue is byte-identical for both users.
- **Owner scoping:** every count, groupBy, raw query, existence lookup and related-record include
  is scoped to the user.
- **Raw SQL:** a single parameterised `Prisma.sql` query. No `$queryRawUnsafe`.
- **Audit log exposure:**
  - Snapshots are never returned.
  - Labels come from a whitelist.
  - Authentication events (IP addresses, user agents) are excluded; a test asserts that no
    "UA"/IP data appears.
- **Rate limiting:** applied to all 4 endpoints (the catalogue endpoint was brought under the
  policy in this phase).
- **Resource bounds:** page size at most 50, at most 120 months, a 20-year cap on custom ranges,
  and capped attention, category and top-N lists.
- **Validation:** invalid filters return 400 `VALIDATION_FAILED` without leaking data (tested).
- **CSV export:** client-side through the shared formula-injection guard.
- **Charts:** ECharts' default tooltip formatter HTML-encodes names. There is no custom HTML and
  no `dangerouslySetInnerHTML`.
- **Dependencies:** `pnpm audit --audit-level high` reports no known vulnerabilities.
- **Documentation:** Phase 2 controls are listed in `docs/architecture/security-baseline.md`.

## 16. Accessibility

- Every chart:
  - has `role="img"` with a one-sentence summary
  - has decal patterns, so colour is not the only cue
  - prints values on the bars
  - has a data table with real `<th scope>` headers and links, plus CSV download
- E2E found and fixed 3 issues in this phase:
  1. ECharts' aria module replaced the chart's accessible name with an auto-generated series dump.
     The summary is now passed as `aria.label.description`.
  2. The definition list in the drawer had an invalid child (axe rule `definition-list`).
  3. Focus was not returned to the info button when the drawer closed. The opener is now
     restored in `onCloseAutoFocus`.
- KPI links have complete accessible names, and a missing value reads "no value" with its
  reason.
- Section landmarks use `aria-labelledby`.
- A polite live region announces when the dashboard updates.
- Animation is disabled under `prefers-reduced-motion`.
- **Axe** (WCAG 2.0/2.1/2.2 A and AA tags), 0 violations on:
  - the empty Command Center
  - the populated Command Center
  - the definition drawer open
  - the metric catalogue page
  - dark theme
  - mobile at 375 px
- **Keyboard:** the E2E keyboard test tabs through filters, KPI links, definition buttons and the
  data table toggles. The drawer opens with Enter, closes with Escape and returns focus.
- **Not done:** no manual screen-reader pass (NVDA/VoiceOver) was performed (§21).

## 17. Performance

Measured on local PostgreSQL 17 with one user holding 1,000 projects, 500 skills, 10,000 evidence
items, 200 certifications and 20,000 audit rows. Each call was run 10 times after a warm-up,
using a temporary benchmark run against the test database and then removed.

| Call                         | Median (ms) | Max (ms) |
| ---------------------------- | ----------- | -------- |
| Dashboard, 90 days           | 34          | 47       |
| Dashboard, all time          | 33          | 38       |
| Dashboard, 365 days filtered | 28          | 31       |
| Activity page                | 20          | 22       |
| Evidence timeline, all time  | 18          | 21       |

- **Caching:** none, and none is needed at this scale. Values are always fresh and the response
  shows `calculatedAt`.
- **ECharts bundle:** about 549 KB raw / about 185 KB gzip, lazy-loaded in its own chunk, so KPIs
  render before the charts.
- **Rendering:** the SVG renderer; charts rebuild only when the data key or theme changes.

## 18. Testing

Exact counts from the final run. Every test passed.

| Suite                                                         | Total in repo       | Added/changed in Phase 2                                                                     |
| ------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| **Unit** (Vitest `unit`)                                      | **141** in 17 files | **+25**: `analytics.test.ts` (22), `drilldown.test.ts` (3). `navigation.test.ts` updated (5) |
| **Integration** (Vitest `integration`, real PostgreSQL/Redis) | **70** in 10 files  | **+14**: `analytics.int.test.ts` (8), `analytics-authz.int.test.ts` (6)                      |
| **Authorization** (subset of integration)                     | **24**              | `analytics-authz` (6, new) + `idor` (13) + `ownership` (5)                                   |
| **E2E** (Playwright, production build, test DB)               | **28** in 3 files   | **+10**: `phase2.spec.ts` (10). `smoke.spec.ts` updated for the live Command Center          |
| **Accessibility** (axe scans inside E2E)                      | **17** scans        | **+6** in `phase2.spec.ts`. 0 violations                                                     |
| **Regression**                                                | Full suites         | All Phase 0/1 tests re-run and passing: unit 116, integration 56, E2E 18                     |

**Test harness change (Phase 1 test, not product).** The Phase 1 export E2E test became deterministic-failing during this phase. On this Windows machine the freshly downloaded file is briefly locked: the first `open` fails with `EPERM`, and `createReadStream()` returned an empty body. The server response and the saved file were both verified to be complete (460 bytes). The test now reads the download through `readDownload()` in `tests/e2e/helpers.ts`, which retries on `EPERM`/`EBUSY` for up to about 5 s. No assertions were weakened.

**Phase 2 E2E coverage of the 13 required flows:**

| #   | Flow                  | Test (`tests/e2e/phase2.spec.ts`)                                                       |
| --- | --------------------- | --------------------------------------------------------------------------------------- |
| 1   | Empty Command Center  | "a new account sees an honest empty Command Center"                                     |
| 2   | Real data             | "KPIs, project health, certifications and skills reflect the real records"              |
| 3   | KPI definition        | "a KPI definition opens in a drawer and is keyboard accessible"                         |
| 4   | Project health filter | "filters live in the URL…" (health=blocked → Active projects 1)                         |
| 5   | Evidence timeline     | "the evidence timeline uses evidence dates and reports undated items"                   |
| 6   | Skill snapshot        | test 2 (facts and top-skill link)                                                       |
| 7   | Certification status  | test 2 (expiry interpretation, attention list) and test 7 (expiring drill-down)         |
| 8   | Recent activity       | "recent activity lists the user's changes with safe labels and links"                   |
| 9   | Drill-down            | "drill-down opens filtered lists whose totals match the KPI" (3 paths)                  |
| 10  | Filters in URL        | "filters live in the URL, survive reload and narrow the widgets"                        |
| 11  | Mobile                | "the Command Center fits a phone without horizontal scrolling" (375 px)                 |
| 12  | Light/dark            | "dark theme renders without accessibility violations" (plus light in other tests)       |
| 13  | Keyboard navigation   | "keyboard: filters, KPIs and chart tables are reachable with Tab", plus the drawer test |

## 19. Validation

All gates were run on the final tree.

| Check                | Command                                                                                  | Result                                 |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| Lint                 | `pnpm lint` (0 warnings allowed)                                                         | PASS                                   |
| Typecheck            | `pnpm typecheck`                                                                         | PASS                                   |
| Formatting           | `pnpm format:check`                                                                      | PASS                                   |
| Prisma format        | `pnpm db:format`                                                                         | PASS (no change)                       |
| Prisma validate      | `pnpm db:validate`                                                                       | PASS                                   |
| Prisma generate      | `pnpm db:generate`                                                                       | PASS                                   |
| Build                | `pnpm build`                                                                             | PASS                                   |
| Unit                 | `pnpm test`                                                                              | 141 / 141                              |
| Integration          | `pnpm test:integration`                                                                  | 70 / 70                                |
| E2E                  | `pnpm test:e2e`                                                                          | 28 / 28                                |
| Migrations from zero | fresh `peos_fresh` → `pnpm db:deploy` (2 migrations) → integration suite → drop          | PASS: 70 / 70 on the fresh DB          |
| Migration drift      | `prisma migrate diff --from-config-datasource --to-schema … --exit-code` on the fresh DB | PASS: "No difference detected", exit 0 |
| Dependency audit     | `pnpm audit --audit-level high`                                                          | PASS: no known vulnerabilities         |

## 20. Acceptance Criteria

| Criterion                                            | Source              | Status  | Evidence                                                                                           |
| ---------------------------------------------------- | ------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| KPIs load from real persisted data                   | `10` Command Center | PASS    | `dashboard.service.ts`; integration "seeded fixture counts"; E2E test 2                            |
| KPI definitions are discoverable                     | `10` Command Center | PASS    | Definition drawer on every KPI/chart, `/command-center/metrics`; E2E test 5                        |
| Every KPI supports drill-down                        | `10` Command Center | PASS    | All 7 displayed KPIs link to a filtered list; KPI = list total (integration)                       |
| Charts have date ranges                              | `10` Command Center | PASS    | Range filter; period-aware charts state their UTC bounds; current-state charts say "Current state" |
| Charts have accessible alternatives                  | `10` Command Center | PASS    | role=img summary, decals, data tables, CSV; axe 0 violations                                       |
| AI insights show evidence                            | `10` Command Center | N/A     | No AI insights in Phase 2 (Copilot is a later phase)                                               |
| Metric catalogue with full governance before any KPI | Phase 2 prompt      | PASS    | 28 metrics, Zod-validated; unit governance tests                                                   |
| Unavailable KPIs are honest, not faked               | Phase 2 prompt      | PASS    | 9 unavailable with reason and phase; `metricResult` throws if computed                             |
| No fake comparisons                                  | Phase 2 prompt      | PASS    | `comparisonFor`; integration "ranges and comparisons", "insufficient data"                         |
| Project health uses the manual field only            | Phase 2 prompt      | PASS    | §7                                                                                                 |
| Recent activity from the audit log as a safe DTO     | Phase 2 prompt      | PASS    | §8; integration activity test                                                                      |
| Evidence timeline by real dates; undated explicit    | Phase 2 prompt      | PASS    | §9; integration and E2E                                                                            |
| Factual skill snapshot, no Phase 4 intelligence      | Phase 2 prompt      | PASS    | §10                                                                                                |
| Certification expiry reuses Phase 1 logic            | Phase 2 prompt      | PASS    | `expiryWhere` import                                                                               |
| URL-synced filters                                   | Phase 2 prompt      | PASS    | E2E test 6                                                                                         |
| Source/freshness visibility                          | Phase 2 prompt      | PASS    | Meta line on every widget; `calculatedAt`                                                          |
| Empty / first-run states                             | Phase 2 prompt      | PASS    | E2E test 1; smoke test                                                                             |
| Owner-scoped, rate-limited endpoints                 | Phase 2 prompt      | PASS    | `analytics-authz.int.test.ts`; `RateLimits.analytics` on all 4                                     |
| User isolation is enforced                           | `10` Global         | PASS    | 24 authorization tests                                                                             |
| Database migrations are deterministic                | `10` Global         | PASS    | §19                                                                                                |
| CI runs lint/typecheck/tests/build                   | `10` Global         | PARTIAL | All gates run locally; no remote CI exists (no remote configured, by instruction)                  |
| UI supports light/dark mode                          | `10` Global         | PASS    | `--chart-*` tokens; E2E dark test                                                                  |
| Responsive layout works                              | `10` Global         | PASS    | E2E mobile at 375 px, no horizontal overflow                                                       |
| WCAG 2.2 AA principles are followed                  | `10` Global         | PARTIAL | axe 0 violations, keyboard E2E; no manual screen-reader audit                                      |
| Manual keyboard check                                | Phase 2 prompt      | PARTIAL | Keyboard paths automated in E2E; no separate human keyboard session                                |

## 21. Specification Gaps

| Gap                               | Detail                                                       | Handling                                                                                 |
| --------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| C7 metric governance              | `00` §4 KPIs lacked formula, source, owner and frequency     | **Resolved** for the 19 available metrics (ADR 0019)                                     |
| "Active" / "Production" undefined | `00` §4 names them without a definition                      | ADR 0018 lifecycle groups                                                                |
| Production evidence ratio         | `05` names it but defines no "production evidence" attribute | Catalogued as unavailable: "Specification decision required"                             |
| Comparison semantics              | No baseline or "better" direction defined                    | Previous value only, no deltas or arrows (ADR 0019)                                      |
| Metric owner                      | Single-user product; `05` expects an owner                   | Owner = the responsible domain module                                                    |
| Domain events (C5)                | No event model                                               | Activity uses the audit log (ADR 0021)                                                   |
| Accessibility verification depth  | `02` asks for WCAG AA but no audit procedure                 | Automated axe and keyboard checks only. A manual screen-reader pass is still outstanding |

## 22. Deferred Features

| Feature                                                           | Phase                                         |
| ----------------------------------------------------------------- | --------------------------------------------- |
| Computed project health score, milestones, delivery rate          | 3                                             |
| Skill coverage, critical gaps, freshness, evidence-derived levels | 4                                             |
| Active goals and goal progress                                    | 5                                             |
| AI experiments                                                    | 6                                             |
| Architecture decisions KPI                                        | 7                                             |
| Technical debt trend                                              | 9                                             |
| AI insights on the Command Center                                 | Copilot phase                                 |
| Production evidence ratio                                         | Needs a spec decision                         |
| Lifecycle distribution widget (metric and drill-down exist)       | 3 (portfolio views)                           |
| Saved dashboard views, metric snapshots/history, caching          | Unscheduled. Not needed at the measured scale |

## 23. Risks

1. **Unbounded growth in live computation.** At 10k evidence and 20k audit rows the dashboard
   answers in about 34 ms. Much larger histories may need pre-aggregation. Mitigation: indexed
   queries, bounded series, and the measurement in §17 as a baseline.
2. **ECharts bundle size** (about 185 KB gzip). It is lazy-loaded, but it still costs bandwidth on
   first chart view.
3. **Formula drift between the KPI and the drill-down.** Mitigated by the KPI = list-total
   integration test, which must be extended whenever a metric is added.
4. **Audit-log coupling.** Activity covers only audited actions. New entities must audit
   in-transaction and add a label whitelist entry.
5. **No manual screen-reader validation yet.** Automated checks can miss announcement-quality
   issues.
6. **No CI.** Gates run locally only, because no remote is configured, by instruction.

## 24. ADRs

| ADR  | Title                                                                  | Status   |
| ---- | ---------------------------------------------------------------------- | -------- |
| 0018 | Project lifecycle groups ("active", "production")                      | Accepted |
| 0019 | Metric catalogue in code and the metric result contract                | Accepted |
| 0020 | Command Center filters and drill-down                                  | Accepted |
| 0021 | Recent activity from the audit log; evidence timeline by evidence date | Accepted |

ADR 0007 (ECharts) is now implemented.

Supporting docs:

- `docs/architecture/analytics.md`
- `docs/architecture/metric-catalogue.md`
- `docs/architecture/api.md`
- `docs/architecture/security-baseline.md`
- `docs/SPECIFICATION_INDEX.md` (C2 and C7 resolved)
- `docs/DEVELOPMENT.md` (Phase 2 notes)

## 25. Phase 3 Readiness

**READY WITH CONDITIONS**

Phase 3 (project intelligence) can build on:

- the lifecycle groups
- the metric catalogue and result contract (add `projects.delivery_rate` and the computed health
  score as new catalogue versions)
- the chart components
- the drill-down mechanism

Conditions:

1. Before Phase 3 defines its own metrics, the spec owner should decide how the **computed health
   score** relates to the manual `healthStatus`: replace it, or sit alongside it. Phase 2 shows
   only the manual field.
2. Every new Phase 3 metric must ship with a catalogue entry, a drill-down mapping and a KPI =
   list-total assertion (ADR 0019/0020).
3. A manual screen-reader pass over the Command Center should be done, or explicitly waived,
   before more chart-heavy views are added.
4. Before relying on the gates for merges, set up CI. This needs a remote, and none is configured
   or pushed by instruction.

Phase 3 has **not** been started.
