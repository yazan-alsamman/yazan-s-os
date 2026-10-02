# PEOS — Phase 3 Project Intelligence Report

Date: 2026-10-03 · Repository: `Yazan_Personal_Engineering_OS_Spec` (dedicated repo, branch `master`, no remote)

## 1. Executive Summary

Phase 3 turns the project detail page into an **engineering dossier**. Every number on it comes
from the user's own persisted records.

- **Milestones.** Milestones are a real, owner-scoped domain entity: a table, check constraints,
  an audited lifecycle, CRUD and drill-down lists.
- **Delivery rate.** The spec 05 Delivery Rate is now computed. It is never shown as 0% when its
  denominator is empty.
- **Two health signals.** Project health now has two independent signals:
  - the user's **manual** assessment, which is untouched and still persisted;
  - a **computed** signal (model `project-health-v1`). It is explained per component, it states
    which inputs are missing, and it never overwrites the manual one (ADR 0023). This resolves
    the Phase 2 health condition.
- **Portfolio.** Portfolio analytics cover:
  - lifecycle, manual health, computed health, and a manual × computed comparison;
  - delivery and milestone trends;
  - technology usage and evidence coverage.

  Every count drills down to a list whose total equals it, and integration tests assert this.

- **Command Center.** The Phase 2 Command Center now lists overdue milestones (00 §4 Critical).
- **Testing.** Verification (E2E and visual checks) found and fixed six real defects (§21, §22, §24). Two of them pre-date Phase 3:
  - the shared create/edit dialog didn't return focus to the button that opened it;
  - an earlier Phase 2 E2E test passed only because it raced the page load.

**Validation.** All gates pass: 166 unit, 89 integration (33 of them authorization), 38 E2E and 23
axe scans; build, typecheck, lint and formatting; Prisma checks; migration from zero; no drift; and
no audit findings.

**Phase 4 readiness:** **READY WITH CONDITIONS** (§32).

## 2. Scope Implemented

| Phase 3 scope (08 / prompt) | Implemented                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Project lifecycle           | Canonical 8-stage order (`LIFECYCLE_ORDER`); dossier stage position; lifecycle distribution, filter and drill-down. No fabricated history (§6)  |
| Milestones                  | Prisma model and migration; create, read, update, delete, complete and reopen; overdue rule; per-project and cross-project lists; audit (§5)    |
| Milestone analytics         | Total, completed, completed in period, overdue, blocked, delivery rate, completion trend (per project and portfolio)                            |
| Project health              | Manual and computed signals shown side by side; 6-component breakdown; missing-data states (§7–§10)                                             |
| Portfolio charts            | `/projects/portfolio`: 7 charts, a matrix table, a KPI strip and an attention list (§14)                                                        |
| Technology mapping          | Per-project usage with "also in N other projects"; portfolio projects-per-technology split by usage type; drill-down to filtered projects (§13) |
| Project evidence            | Dossier summary (verified, dated, by type, provenance), timeline, related skills, evidence drill-down by project (§12)                          |
| Engineering dossier         | Overview · Health · Delivery · Engineering context · Evidence · Activity (§11)                                                                  |
| APIs                        | 7 new endpoints plus 2 list filters (§16)                                                                                                       |
| Tests, docs, ADRs           | +25 unit, +19 integration, +10 E2E; ADRs 0022–0025; docs updated (§24, §27)                                                                     |

**Explicitly not implemented** (later phases or blocked by the spec): skill intelligence, goals,
the AI Lab, architecture intelligence, the Copilot, integrations, a recommendations engine, an
event bus, the portfolio matrix, the technology heatmap, blocked time and scope stability (§29).

## 3. Repository / Commit Information

| Commit    | Content                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| `9bc62e7` | Phase 3: milestone domain, schema and migration                                          |
| `44d56e5` | Phase 3: computed health, project intelligence and portfolio analytics                   |
| `3caa609` | Phase 3: project dossier, portfolio UI and E2E                                           |
| _(final)_ | Phase 3: ADRs 0022–0025, documentation and this report (the commit containing this file) |

- The repository root was verified as `C:/Users/Lenovo/Desktop/yazan/Yazan_Personal_Engineering_OS_Spec`
  before every commit.
- Files were staged by explicit path; `git add -A` was never used.
- **No remote is configured and nothing was pushed.**
- The home-folder repository was not modified.

## 4. Final Project Domain Model

```
Project (Phase 1, unchanged columns)
 ├── healthStatus            manual assessment (ADR 0023) — never written by computation
 ├── status                  8-stage lifecycle (01 §3), current stage only
 ├── startDate · targetDate · completedAt (@db.Date)
 ├── Milestone[]             NEW (ADR 0022) — composite FK (project_id, user_id), cascade
 ├── TechnologyUsage[]       Phase 1 (usageType) → technology mapping
 ├── ProjectSkill[]          Phase 1
 └── ProjectEvidence[]       Phase 1 → evidence intelligence
Computed (not stored): project health v1, delivery rate, evidence/technology aggregates
```

| Decision                                                        | Reason                                                        | Spec reference      | Implementation                                    | Tests                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------- | ------------------- | ------------------------------------------------- | --------------------------------------------- |
| No new Project columns (Users, Business value, Risks not added) | Absent from 04; adding them would be speculative (gap P3-1)   | 01 §3 vs 04 Project | —                                                 | —                                             |
| Computed health and aggregates are not persisted                | Avoids stale copies and write triggers; deterministic per day | 01 §3; ADR 0023     | `project-intelligence.ts`, `portfolio.service.ts` | int: "never changes the manual health status" |

## 5. Milestone Model

| Field         | Type               | Notes                                                       |
| ------------- | ------------------ | ----------------------------------------------------------- |
| `id`          | uuid               | `@@unique([id, userId])`                                    |
| `userId`      | uuid               | Owner; FK users (cascade)                                   |
| `projectId`   | uuid               | FK `(project_id, user_id) → projects(id, user_id)`, cascade |
| `title`       | text               | 1–200 characters, not blank (check constraint)              |
| `dueDate`     | date?              | Spec "dueDate": the planned date                            |
| `completedAt` | date?              | Set if and only if status = completed (check constraint)    |
| `status`      | `milestone_status` | planned · in_progress · blocked · completed · cancelled     |
| timestamps    | timestamptz        | `createdAt`, `updatedAt`                                    |

- **Lifecycle:**
  - Every transition is allowed.
  - Completing without a date sets it to today (UTC); a future completion date is rejected.
  - A completion date with any other status is rejected.
  - Reopening (completed → any other status) clears the date.
  - Audit verbs: `created`, `updated`, `completed`, `reopened`, `deleted`.
- **Overdue:** the milestone is open, `dueDate < today (UTC)` and its project is not archived. A
  milestone due today is not overdue, and an undated one never is.
- **Limits and ordering:** at most 500 milestones per project. Ordering is by `dueDate` (nulls
  last), with id as tie-breaker.
- **Deferred:** `goalId` (Phase 5), description and ordering position (not in 04), and
  import/export of milestones.

| Decision                                | Reason                                                      | Spec ref                               | Implementation                                | Tests                                                      |
| --------------------------------------- | ----------------------------------------------------------- | -------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| 5 statuses incl. `blocked`, `cancelled` | Real blocker representation; scope removal without deletion | 04 Milestone.status (values undefined) | `milestone.rules.ts`, enum `MilestoneStatus`  | unit `milestone.rules.test.ts` (11)                        |
| completed ⇔ completedAt (DB check)      | Single source of truth for completion                       | 04 completedAt                         | migration `…_project_intelligence_milestones` | int "database enforces completed ⇔ completion date"        |
| Overdue excludes archived projects      | Abandoned work isn't "late" forever                         | 00 §4 Overdue milestone                | `isOverdue`, `overdueWhere`                   | unit boundaries; int portfolio "overdue excludes archived" |
| UTC calendar day as "today"             | Deterministic; matches the Phase 2 period semantics         | ADR 0019                               | `shared/calendar.ts`                          | unit "midnight UTC is the first instant of the new day"    |
| Hard delete plus audit                  | Existing PEOS convention; `cancelled` keeps history         | ADR 0011                               | `milestone.service.ts`                        | int lifecycle audit sequence                               |

## 6. Project Lifecycle

- **Canonical order:** idea → discovery → architecture → development → validation → production →
  maintenance → archived (`LIFECYCLE_ORDER`).
- **Groups:** ADR 0018's active and production groups are reused unchanged.
- **Dossier:** shows "Stage n of 8" and renders each stage as a link to `/projects?status=…`, with
  `aria-current="step"` on the current stage. It states in words that **transition history is not
  recorded**; no earlier stage is drawn as "passed".
- **Portfolio:** the lifecycle distribution has all 8 buckets including zeros. Each bucket drills
  to `/projects?status=…`, and integration tests assert list total = bucket.
- **Limitation:** lifecycle durations and blocked time are unavailable, and the audit log is never
  used to reconstruct them (ADR 0025).

## 7. Project Health Model

| Signal                      | Source                                  | Persisted                | Changed by                  |
| --------------------------- | --------------------------------------- | ------------------------ | --------------------------- |
| Manual health               | `Project.healthStatus`                  | Yes                      | The user only (Edit dialog) |
| Computed health signal (v1) | Milestones, project dates, audit events | No (computed on request) | Never written               |

- The UI labels both explicitly, and they use different vocabularies: On track / At risk / Blocked
  versus Good / Needs watching / Poor.
- The portfolio's manual × computed matrix shows agreement without a verdict.
- **Decision:** ADR 0023.
- **Specification:** 01 §3 plus the Phase 2 condition.
- **Implementation:** `project-health.ts`, `HealthPanel` (`dossier.tsx`).
- **Tests:** unit (13), integration (dossier and manual-unchanged), E2E "manual and computed
  health are distinct".

## 8. Computed Health Formula

`project-health-v1`. Overall score = **round(mean of the scored components)**, each weighted
equally.

- An overall score is shown only when **at least 2** components are scored.
- Bands: **≥ 75 Good**, **50–74 Needs watching**, **< 50 Poor**.
- Archived projects are **not assessed**.
- The evaluation day is the UTC calendar day of the request.

**Unspecified decisions** were identified and resolved in ADR 0024: what counts as a "planned
milestone", the zero-denominator rule, the component scale, weights, minimum coverage, bands,
archived projects and the evaluation day.

**Delivery rate** = completed ÷ (completed + overdue).

- Cancelled milestones, milestones not yet due and undated open milestones are excluded.
- With a 0 denominator the state is `insufficient_data` (`no_data` without milestones), and the
  value is never 0%.

## 9. Health Component Breakdown

| Component            | State when data exists      | Rule                                                                         | Missing → state                        |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| Schedule             | scored                      | Completed: ≤ target → 100, late → 50. Open: target ≥ today → 100, passed → 0 | No target → insufficient_data          |
| Milestone completion | scored                      | round(100 × delivery rate)                                                   | Denominator 0 → insufficient_data      |
| Blockers             | scored                      | Any blocked open milestone → 0, else 100                                     | No open milestones → insufficient_data |
| Recent activity      | scored (active stages only) | ≥ 1 project or milestone audit event in 30 days → 100, none → 0              | Other stages → not_applicable          |
| Scope stability      | —                           | No data source                                                               | Always **unavailable**                 |
| Issue severity       | —                           | No data source (integrations, Phase 9)                                       | Always **unavailable**                 |

Each component carries `{key, label, state, score, explanation, inputs}`. The dossier renders them
as a table (Component · Result · Score · Explanation · Source). The overall explanation names every
scored component and its score, and gives the number not scored.

**Tests:** `project-health.test.ts` covers each component, the boundaries (target today, 75/74/50/49
bands, midnight UTC), determinism, the archived rule and the minimum coverage.

## 10. Missing-Data Semantics

A missing input is never 0, never assumed healthy and never assumed unhealthy. It is never hidden.

- **Component level:** `insufficient_data`, `not_applicable` or `unavailable`, always with a
  one-sentence reason.
- **Overall level:**
  - `complete` — unreachable in v1, because two components have no source; stated in the ADR.
  - `partial`
  - `insufficient_data` — fewer than 2 scored; no number and no band, shown as "—" with the
    reason.
  - `not_applicable` — archived.
- **Metric level (MetricResult):** milestone and evidence metrics return `no_data` with
  `value: null` when the project has none. Delivery rate returns `insufficient_data` when nothing
  is completed or overdue.
- **Verified:**
  - integration tests "empty project gets explicit no-data states" and "delivery rate is
    insufficient (not 0%)";
  - E2E "an empty project is honest".

## 11. Project Engineering Dossier

`/projects/:id` has an in-page section navigation and these sections:

| Section             | Content                                                                                                                                                                                     | Source                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Overview            | Identity (description, problem, solution, impact); lifecycle stage; schedule (start, target, completed, days to or past target); links; provenance                                          | Project, intelligence                    |
| Health              | Manual vs computed cards; components table; definition drawer ("How computed health is calculated")                                                                                         | `GET /projects/:id/intelligence`         |
| Delivery            | Milestones, completed, overdue and blocked facts (each drilling to the milestones list); delivery rate with numerator and denominator; milestone manager                                    | intelligence, `/projects/:id/milestones` |
| Engineering context | Technologies (usage type, "also in N other projects" → filtered projects); skills; note that ADRs and experiments come in Phases 7 and 6                                                    | Project, intelligence                    |
| Evidence            | Summary (linked, verified, unverified, dated, undated, imported → `/evidence?projectId=…`); by type; timeline (latest 10 dated); skills supported by this evidence; linked evidence manager | intelligence, Project                    |
| Activity            | Project and milestone audit events as safe DTOs, paginated                                                                                                                                  | `GET /projects/:id/activity`             |

- The Phase 1 edit, delete, relationship pickers and provenance are preserved, as verified by E2E.
- Users, Business value and Risks are **not shown**, because no data model defines them (gap
  P3-1). No empty fake sections are rendered.

## 12. Project Evidence Intelligence

- **Counts** come from `ProjectEvidence` joins, owner-scoped: total, verified, dated, undated,
  by type (`groupBy`) and by origin.
- **Timeline:** dated evidence by evidence date, newest first, capped at 10. Undated items are
  counted and stated, never placed on the timeline.
- **Related skills:** skills linked through `SkillEvidence` to this project's evidence, top 10 by
  count.
- **Drill-down:** the new `/evidence?projectId=` filter. Integration tests assert dossier total
  and verified count = list totals. E2E asserts that unrelated evidence is excluded; this was a
  bug, now fixed (§21).

## 13. Technology Mapping

- **Dossier:** each technology shows its usage type and "Only this project" or "Also in N other
  projects", linked to `/projects?technologyId=…`.
- **Portfolio:** "Technology usage across projects", a stacked bar by usage type (core,
  supporting, infrastructure, tooling, other), showing the top 15 and summarising the rest. The
  data table drills to filtered projects; integration tests assert row total = list total.
- **Deliberately not built:** proficiency scores, Technology ↔ Skill (Phase 4) and the technology
  heatmap (usage is undated).

## 14. Portfolio Analytics

`/projects/portfolio`. The range filter (default 365 days, URL-synced) applies to the trends only.
Every chart has:

- a definition
- its source
- period or current-state semantics
- the calculated time
- a data table and CSV download
- drill-down
- an empty state

| Widget                      | Metric key                                 | Temporal | Drill-down                                     |
| --------------------------- | ------------------------------------------ | -------- | ---------------------------------------------- |
| KPI: Milestones             | projects.milestones_total                  | point    | `/projects/milestones`                         |
| KPI: Milestones completed   | projects.milestones_completed_in_period    | period   | milestones `completedFrom/To`                  |
| KPI: Overdue milestones     | projects.milestones_overdue                | point    | milestones `overdue=true`                      |
| KPI: Blocked milestones     | projects.milestones_blocked                | point    | milestones `status=blocked`                    |
| KPI: Delivery rate          | projects.delivery_rate                     | point    | milestones `status=completed` (numerator)      |
| Projects by lifecycle stage | projects.lifecycle_distribution            | point    | `/projects?status=`                            |
| Needs attention             | (overdue milestones, poor computed health) | point    | project dossier                                |
| Manual health               | projects.health_distribution               | point    | `/projects?healthStatus=`                      |
| Computed health             | projects.computed_health_distribution      | point    | `/projects/health?computed=`                   |
| Manual vs computed          | projects.health_comparison                 | point    | `/projects/health?manual=&computed=`           |
| Project delivery trend      | projects.delivery_trend                    | period   | projects `completedFrom/To` (month, clamped)   |
| Milestone completions       | projects.milestone_completion_trend        | period   | milestones `completedFrom/To` (month, clamped) |
| Technology usage            | projects.technology_usage                  | point    | `/projects?technologyId=`                      |
| Project evidence coverage   | projects.evidence_coverage                 | point    | `/projects?hasEvidence=`                       |

**Not shown, by design** (the page states this): the portfolio matrix, the technology heatmap and
blocked time.

## 15. Metric Catalogue Changes

The catalogue went from **28 metrics (19 available)** to **52 metrics (39 available, 13
unavailable)**. There is still a single catalogue, and its governance schema now accepts the value
types `ratio`, `score` and `matrix`. The full definitions are in
`docs/architecture/metric-catalogue.md`, generated from code.

| Change                 | Keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now available (v2)     | `projects.delivery_rate` (was unavailable "Phase 3")                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Added, available (19)  | `projects.milestones_total`, `.milestones_completed`, `.milestones_completed_in_period`, `.milestones_overdue`, `.milestones_blocked`, `.milestone_completion_trend`, `.delivery_trend`, `.health_score`, `.health_component.schedule`, `.health_component.milestones`, `.health_component.blockers`, `.health_component.recent_activity`, `.computed_health_distribution`, `.health_comparison`, `.technology_usage`, `.evidence_coverage`, `.evidence_linked`, `.evidence_verified`, `.evidence_by_type` |
| Added, unavailable (5) | `projects.health_component.scope_stability` (spec decision), `projects.health_component.issue_severity` (Phase 9), `projects.blocked_time` (spec decision: status history), `projects.portfolio_matrix` (spec decision: fields), `projects.technology_heatmap` (spec decision: dated usage)                                                                                                                                                                                                                |

- **Governance fields:** every new metric has a key, name, category, definition, formula, source,
  frequency, owner, caveats, value type, temporal semantics, availability, drill-down, version,
  introduced and revised. Unit governance tests enforce this; they now expect 52 / 39.
- **Drill-down coverage:** a unit test requires a mapping for **every** available metric.
  Integration tests assert value = list total for every count and bucket.
- **Documented exception:** score metrics are explained by their component breakdown, not by a
  list (ADR 0025).

## 16. API Surface

All new endpoints require authentication and are owner-scoped. Identity comes from the session.
Validation uses Zod with the standard error shape, and foreign or missing ids return 404.

| Method               | Path                                | Rate limit                        | Purpose                                             |
| -------------------- | ----------------------------------- | --------------------------------- | --------------------------------------------------- |
| GET · POST           | `/api/v1/projects/:id/milestones`   | analytics (GET) · mutation (POST) | Project milestones · create (project from the path) |
| GET                  | `/api/v1/milestones`                | analytics                         | Cross-project milestone list (drill-down source)    |
| GET · PATCH · DELETE | `/api/v1/milestones/:id`            | default · mutation                | Read · update / complete / reopen · delete          |
| GET                  | `/api/v1/projects/:id/intelligence` | analytics                         | Dossier analytics                                   |
| GET                  | `/api/v1/projects/:id/activity`     | analytics                         | Project activity (safe DTOs)                        |
| GET                  | `/api/v1/analytics/portfolio`       | analytics                         | Portfolio analytics                                 |
| GET                  | `/api/v1/analytics/project-health`  | analytics                         | Computed health per project (source list)           |

- **New list filters:** `/projects?hasEvidence=`, `/evidence?projectId=`.
- **Route conventions:** the prompt suggested `/projects/:id/health`, `/evidence` and
  `/technologies` GET routes. These are consolidated into `/projects/:id/intelligence`, so the
  dossier needs one request, because:
  - the existing `/projects/:id/evidence` and `/technologies` routes are Phase 1 PUT
    relationship endpoints;
  - project detail already returns the relationships.

## 17. Database Changes

- **Migration `20261002215832_project_intelligence_milestones`:**
  - enum `milestone_status`
  - table `milestones`
  - 3 indexes plus the `(id, user_id)` unique index
  - 2 foreign keys (to users, and the composite to projects, both cascade)
  - 2 check constraints (`milestones_completion_chk`, `milestones_title_not_blank_chk`)
- **No existing table or column was changed.** The only edit to an existing model is a doc comment
  on `ProjectHealth`. No data migration and no seed data.

| Decision                                                                                   | Reason                                                              | Spec ref     | Implementation | Tests                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------ | -------------- | ------------------------------------------------------ |
| Composite FK with owner                                                                    | DB-level IDOR prevention (Phase 1 pattern)                          | ADR 0011; 07 | migration      | int "owner–project link" (cross-owner insert rejected) |
| Indexes `(project_id, due_date)`, `(user_id, status, due_date)`, `(user_id, completed_at)` | Match the dossier list, overdue/status and completion-range queries | —            | schema.prisma  | benchmark §23                                          |

## 18. Migrations

The migration was created with `prisma migrate dev --create-only` and the check constraints were
added by hand. It was applied to `peos` and `peos_test`.

**Migration-from-zero:**

1. Created a fresh `peos_fresh` database.
2. `pnpm db:deploy` applied **3 migrations**.
3. `prisma migrate diff --from-config-datasource --to-schema --exit-code` reported "No difference
   detected" (exit 0).
4. Both check constraints are present.
5. The integration suite passed on the fresh DB: **89 / 89**.
6. Dropped the database.

The migration is additive and non-destructive, and does not depend on any seed data.

## 19. Authorization and User Isolation

`tests/integration/project-intelligence-authz.int.test.ts` runs 9 HTTP tests with two real
sessions:

| Attack (Bob → Alice)                                                                                             | Result                                    |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| No session on all 7 new GET surfaces                                                                             | 401                                       |
| Read, update or delete Alice's project                                                                           | 404; unchanged                            |
| List, create under, read, update or delete Alice's milestone                                                     | 404; unchanged, no row created            |
| Move his own milestone to Alice's project (`projectId`, `userId` in body)                                        | Fields ignored; milestone stays his       |
| `/milestones?projectId=alice`, `/evidence?projectId=alice`, `/projects?technologyId=alice-tech&hasEvidence=true` | Empty lists                               |
| Alice's dossier intelligence or activity                                                                         | 404, no "Alice" in body                   |
| Link Alice's evidence or technology to his project                                                               | 400; nothing linked                       |
| Portfolio and computed-health list with injected `userId` / `ownerId`                                            | Only Bob's data (1 project, 2 milestones) |
| Invalid input (incomplete or oversized custom range, unknown bucket, bad boolean, page size 10000)               | 400 VALIDATION_FAILED                     |
| Malformed path id                                                                                                | 404 (Phase 1 convention)                  |

The Phase 1 `idor` (13), `ownership` (5) and Phase 2 `analytics-authz` (6) suites still pass, for
**33 authorization tests** in total.

## 20. Audit Logging

- **Milestones:** `milestone.created`, `.updated`, `.completed`, `.reopened` and `.deleted` are all
  written in the mutation's transaction, with domain-only snapshots (no owner id). An integration
  test asserts the exact sequence and that snapshots carry no owner.
- **Project changes:** these keep their Phase 1 audit.
- **Not audited:** computed health is not persisted, so there is no health mutation to audit, and
  there is no computed-health configuration.
- **Activity:**
  - The Phase 2 activity feed shows milestone events, with labels from a whitelist (`title`) and
    links to `/projects/:projectId#milestones` only if the milestone still exists.
  - Project activity reuses the same presenter, so snapshots never leave the server. A test checks
    that no `before`, `after` or `userId` appears.

## 21. UX / UI

- **New pages:**
  - the dossier (restructured `/projects/:id`)
  - `/projects/portfolio`
  - `/projects/milestones`
  - `/projects/health`
  - a Projects section tab bar (Projects · Portfolio · Milestones · Computed health)
- **Reuse:** the existing design tokens, panels, badges, ChartCard/EChart, KpiCard, definition
  drawer and ResourceList (new `canCreate` option; the milestones list is created from projects
  only).
- **Labels:** "Health" is now labelled "Manual health" in the form, the list column and the filter.
- **States:** every section has explicit empty, unavailable and loading states. Values that don't
  exist render as "—" with a reason.
- **Mobile at 375 px:** no horizontal page overflow on the dossier or portfolio. Milestone rows
  stack (title first), and wide tables scroll inside labelled, focusable regions.
- **Defects found and fixed during verification:**
  1. Drill-down parameters were ignored by the lists: `projectId` on evidence, and
     `technologyId` / `skillId` / `hasEvidence` on projects. They are now declared, with
     removable chips.
  2. Milestone titles were squeezed on mobile.
  3. The technology chart legend overlapped; it now scrolls and shows only the series present.
  4. "1 projects" pluralisation.

## 22. Accessibility

- **Automated:** **23 axe scans** (WCAG 2.0/2.1/2.2 A and AA tags) with 0 violations. The 6 new
  ones cover:
  - the dossier
  - the portfolio
  - the overdue milestones list
  - the computed-health list
  - the dark dossier
  - the mobile dossier
- **Keyboard (E2E):**
  - "Add milestone" opens with Enter.
  - The title field is focused when the dialog opens.
  - Escape closes the dialog and **focus returns to the trigger**.
  - Tab reaches the section links, the health definition button, "Add milestone" and the
    milestone actions.
- **Fixed:**
  - `EntityFormDialog` now records the element that opened it and restores focus on close. This
    also fixes every Phase 1 create/edit dialog.
  - Horizontally scrolling regions are now keyboard-focusable (axe `scrollable-region-focusable`).
- **Charts:**
  - every chart has a one-sentence accessible name;
  - decals and values on the bars, so colour is never the only cue;
  - a data table with links and CSV download.
- **Dossier markup:**
  - The lifecycle uses `aria-current="step"`.
  - Health components are a real `<table>` with a caption and `scope` headers.
  - Each milestone action has a full name, e.g. "Mark Load testing (k6) complete".
- **Manual screen-reader audit: NOT DONE.** WCAG status remains **PARTIAL** (§26).

## 23. Performance

**Setup:**

- PostgreSQL 17.10 (Docker, local); service-layer calls.
- Dataset for one user:
  - 1,000 projects
  - 20,000 milestones
  - 10,000 evidence items (10,000 project links)
  - 500 technologies (5,000 usages)
  - 50,000 audit rows
- Method: 1 warm-up run (excluded), then 10 timed runs; the median is the mean of the 5th and 6th
  runs.
- The benchmark was run **twice**, as a temporary test file that was removed afterwards.

| Call                                                                                     | Median run 1 (ms) | Max run 1 (ms) | Median run 2 (ms) | Max run 2 (ms) |
| ---------------------------------------------------------------------------------------- | ----------------- | -------------- | ----------------- | -------------- |
| Project dossier record (detail)                                                          | 35.4              | 48.0           | 38.3              | 48.6           |
| Project intelligence (incl. health)                                                      | 45.5              | 55.1           | 54.2              | 59.9           |
| Milestone listing (project, 50)                                                          | 9.0               | 10.0           | 15.8              | 18.5           |
| Milestone listing (all projects, overdue)                                                | 17.2              | **1711.1**¹    | 13.7              | 20.0           |
| Project activity (page 1)                                                                | 43.4              | 54.9           | 46.1              | 52.5           |
| Portfolio analytics, 365 days (milestone analytics + computed health for 1,000 projects) | 79.0              | 84.3           | 78.4              | 96.7           |
| Portfolio analytics, all time                                                            | 76.1              | 87.1           | 74.0              | 80.8           |
| Health calculation: computed-health list (1,000 projects)                                | 63.0              | 67.7           | 58.8              | 77.3           |

¹ A single outlier immediately after the bulk insert, most likely autovacuum or statistics. It did
not recur.

**Design choices behind these numbers:**

- No N+1: health for N projects takes three aggregate queries.
- Every list is bounded or paginated.
- Aggregation happens in PostgreSQL.
- Independent queries run in parallel.
- **No caching was introduced.**

**Concern:** the Phase 1 project detail still loads every linked skill, technology and evidence
item without pagination (≤ 500 per relation by the id-set limits), at 35–38 ms at this scale (§30).

## 24. Testing

| Suite                                 | Result       | Phase 3 additions                                                                      |
| ------------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| Unit                                  | **166/166**  | +25: `milestone.rules.test.ts` 11, `project-health.test.ts` 13, `drilldown.test.ts` +1 |
| Integration                           | **89/89**    | +19: `project-intelligence.int.test.ts` 10, `project-intelligence-authz.int.test.ts` 9 |
| Authorization (subset of integration) | **33/33**    | +9 (Phase 3 HTTP matrix); 13 idor + 5 ownership + 6 analytics-authz                    |
| E2E                                   | **38/38**    | +10: `phase3.spec.ts` (setup + 9 flows); smoke 8, Phase 1 10, Phase 2 10               |
| Accessibility scans (axe)             | **23/23**    | +6                                                                                     |
| Regression (Phases 0–2)               | **All pass** | Unit 141, integration 70, E2E 28 (Phase 0–2 tests within the totals above)             |

**E2E coverage of the 16 required flows:**

| #   | Flow                                | Test                                                               |
| --- | ----------------------------------- | ------------------------------------------------------------------ |
| 1   | Existing project detail still works | "the dossier keeps Phase 1 behaviour…" (edit, relationships)       |
| 2   | Create milestone                    | "create, edit, complete and reopen…"                               |
| 3   | Edit milestone                      | same                                                               |
| 4   | Complete milestone                  | same (delivery rate 50% → 100%)                                    |
| 5   | Overdue appears                     | same (badge; reappears on reopen) and portfolio KPI → overdue list |
| 6   | Manual vs computed distinct         | "manual and computed health are distinct…"                         |
| 7   | Health explanation visible          | same (component rows, definition drawer)                           |
| 8   | Dossier shows real relationships    | test 1 (technologies, skills, evidence; unrelated evidence absent) |
| 9   | Technology mapping                  | portfolio test (data table → `/projects?technologyId=`)            |
| 10  | Project evidence section            | "project evidence section counts only linked evidence…"            |
| 11  | Portfolio reflects seeded data      | portfolio test (KPI values 3 / 1 / 1 / 50%, lifecycle)             |
| 12  | Drill-down to filtered source       | portfolio test (overdue, technology, computed bucket)              |
| 13  | Empty project honest                | "an empty project is honest…"                                      |
| 14  | Mobile dossier                      | "the dossier and portfolio fit a phone…"                           |
| 15  | Light/dark                          | "dark theme dossier…" (+ light in other tests)                     |
| 16  | Keyboard navigation                 | "keyboard: add a milestone without a mouse…"                       |

**Test changes outside Phase 3 files:**

- **Phase 2 `phase2.spec.ts`:** the filter locators are scoped to the filters region.
  `getByLabel("Project health")` had always matched 4 elements (the select, the chart region, the
  chart image and the info button), and the test passed only by racing the dashboard render.
  Assertions are unchanged.
- **Governance test:** now expects 52 / 39.
- **Drill-down coverage test:** uses a realistic sample bucket per metric shape. The assertion is
  unchanged.

## 25. Validation

```
Unit:                 166/166
Integration:          89/89
Authorization:        33/33
E2E:                  38/38
Accessibility scans:  23/23 (0 violations)
Build:                PASS
Typecheck:            PASS
Lint:                 PASS (0 warnings)
Formatting:           PASS
Prisma format:        PASS
Prisma validation:    PASS
Prisma generate:      PASS
Fresh migration:      PASS (3 migrations; integration 89/89 on the fresh DB)
Migration drift:      PASS (exit 0, "No difference detected")
Dependency audit:     PASS (pnpm audit --audit-level high: no known vulnerabilities)
CI:                   NOT RUN — no remote or CI exists (not configured, by instruction)
Manual screen-reader: NOT RUN — requires a human with NVDA/VoiceOver
```

## 26. Acceptance Criteria

| Area          | Criterion                                        | Status  | Evidence                                                                                                                                          |
| ------------- | ------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects      | Full CRUD (still functional)                     | PASS    | Phase 1 tests; E2E edit in the dossier                                                                                                            |
| Projects      | Lifecycle states                                 | PASS    | 8-stage lifecycle, distribution, filter and drill-down. Transition history is not recorded (documented limitation)                                |
| Projects      | Milestones                                       | PASS    | §5; unit 11, integration lifecycle, E2E create/edit/complete/reopen/overdue                                                                       |
| Projects      | Skills/technology relationships                  | PASS    | Dossier context, technology mapping, drill-down tests                                                                                             |
| Projects      | Evidence relationships                           | PASS    | §12; integration and E2E                                                                                                                          |
| Projects      | Health explanation                               | PASS    | 6-component breakdown, explanations, model version; E2E                                                                                           |
| Projects      | Portfolio analytics                              | PASS    | §14; integration equality for every bucket; E2E                                                                                                   |
| Phase 3       | Project detail is a complete engineering dossier | PARTIAL | All data PEOS records is shown. 01's Users, Business value and Risks have no data model (gap P3-1); architecture and experiments are later phases |
| Global        | Authentication                                   | PASS    | 401 on all new endpoints                                                                                                                          |
| Global        | User isolation                                   | PASS    | 33 authorization tests                                                                                                                            |
| Global        | Validation                                       | PASS    | Zod schemas; 400 tests; DB check constraints                                                                                                      |
| Global        | Deterministic migrations                         | PASS    | §18                                                                                                                                               |
| Global        | CI status                                        | PARTIAL | All gates run locally; no CI (no remote)                                                                                                          |
| Global        | Error observability                              | PASS    | Unchanged Phase 0 logging and request ids; standard error shape on new routes                                                                     |
| Global        | Light/dark                                       | PASS    | E2E dark dossier with axe                                                                                                                         |
| Global        | Responsive                                       | PASS    | E2E 375 px, no overflow, milestone layout                                                                                                         |
| Global        | WCAG 2.2 AA                                      | PARTIAL | Automated axe and keyboard E2E only; no manual screen-reader audit                                                                                |
| Phase 2 regr. | Command Center                                   | PASS    | `phase2.spec.ts` 10/10, `analytics.int` 8/8                                                                                                       |
| Phase 2 regr. | Metric catalogue                                 | PASS    | Governance tests (52/39)                                                                                                                          |
| Phase 2 regr. | KPI drill-down                                   | PASS    | Integration equality test; E2E                                                                                                                    |
| Phase 2 regr. | Filters                                          | PASS    | E2E (locator scoped, assertions unchanged)                                                                                                        |
| Phase 2 regr. | Recent activity                                  | PASS    | Integration activity test (now includes milestones)                                                                                               |
| Phase 2 regr. | Evidence timeline                                | PASS    | Integration and E2E                                                                                                                               |
| Phase 2 regr. | Accessibility                                    | PASS    | Phase 2 axe scans 6/6                                                                                                                             |
| Phase 2 regr. | Authorization                                    | PASS    | `analytics-authz` 6/6                                                                                                                             |

## 27. ADRs

| ADR  | Title                                                                     | Status   |
| ---- | ------------------------------------------------------------------------- | -------- |
| 0022 | Milestone model and lifecycle                                             | Accepted |
| 0023 | Manual health and computed health are independent signals                 | Accepted |
| 0024 | Computed health formula v1, delivery rate and missing inputs              | Accepted |
| 0025 | Portfolio analytics semantics, technology mapping and the project dossier | Accepted |

**Updated docs:**

- `docs/architecture/api.md`
- `analytics.md` (including Phase 3 performance)
- `metric-catalogue.md` (regenerated from code)
- `security-baseline.md`
- `domain-model.md`
- `docs/DEVELOPMENT.md`
- `docs/SPECIFICATION_INDEX.md` (P3 gaps)
- `docs/decisions/README.md`

## 28. Specification Gaps

| ID   | Gap                                                                                        | Handling                              |
| ---- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| P3-1 | 01 §3 lists Users, Business value, Risks, Owner and Architecture on a project; 04 has none | Not added; spec owner decision needed |
| P3-2 | Health weights, thresholds, missing-input rules and "planned milestones" undefined         | ADR 0024 (v1)                         |
| P3-3 | Scope stability has no committed-scope baseline                                            | Unavailable component                 |
| P3-4 | Issue severity has no issue domain                                                         | Unavailable (Phase 9 integrations)    |
| P3-5 | Blocked time and lifecycle durations need status history                                   | Unavailable; never reconstructed      |
| P3-6 | Portfolio matrix lacks numeric impact, complexity and effort                               | Unavailable                           |
| P3-7 | Technology heatmap lacks dated usage                                                       | Unavailable                           |
| P3-8 | Milestone.goalId: Goals are Phase 5                                                        | Deferred                              |
| P3-9 | Milestone statuses, reopen rules and ordering undefined in 04                              | ADR 0022                              |

## 29. Deferred Features

| Feature                                                          | Deferred to / blocked by                              |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| Milestone `goalId`, Goal ↔ Milestone                             | Phase 5                                               |
| Milestones in JSON/CSV export and import                         | Exchange schema extension (next data-platform change) |
| Computed health history, "project with declining health" (00 §4) | Needs persisted snapshots (ADR 0023)                  |
| Scope stability, blocked time, lifecycle durations               | Spec decision plus history model                      |
| Issue severity, DORA-style engineering metrics                   | Phase 9                                               |
| Portfolio matrix, technology heatmap                             | Spec decision on fields                               |
| Technology ↔ Skill, proficiency                                  | Phase 4                                               |
| Project ADRs and AI experiments in the dossier                   | Phases 7 / 6                                          |
| Milestone drag-and-drop ordering                                 | Not specified                                         |

## 30. Risks

1. **Health formula subjectivity.** v1 thresholds and equal weights are reasoned but not
   empirically validated. They are mitigated by full transparency, versioning and ADR governance.
2. **Partial health by construction.** Two of six components have no source, so users could still
   over-trust a partial score. The UI labels it "Partial" and lists the unavailable components.
3. **Activity measures PEOS edits, not engineering work.** This is stated in the component
   explanation and caveats.
4. **Unbounded Phase 1 project detail relations** (≤ 500 per relation by input limits). It is fast
   at the benchmarked scale, but a candidate for pagination.
5. **Live computation of computed health** for every project on each portfolio request takes about
   80 ms at 1,000 projects. Pre-aggregation may be needed at a much larger scale.
6. **Benchmark outlier** (1.7 s once after the bulk insert). It did not recur; monitor in real use.
7. **No CI and no manual screen-reader audit** (§25).

## 31. Phase 2 Regression Status

**No regression.**

- Command Center, metric catalogue, KPI drill-down, filters, recent activity, evidence timeline,
  accessibility and authorization all pass: `phase2.spec.ts` 10/10, `analytics.int` 8/8,
  `analytics-authz` 6/6 and governance tests.
- **Changes to Phase 2 behaviour, all additive:**
  - the Needs attention panel adds overdue milestones (00 §4 Critical);
  - the project health chart note now points to computed health;
  - the activity feed recognises milestone events;
  - `KpiCard` gained an optional value formatter.
- **One Phase 2 E2E locator was made unambiguous** (§24). It was latent test fragility, not a
  product change.

## 32. Phase 4 Readiness

**READY WITH CONDITIONS**

Phase 4 (Skills & Career Intelligence) can build on:

- the metric catalogue and its result contract;
- the drill-down mechanism;
- project ↔ skill and evidence links;
- project evidence intelligence, with skills supported by this project's evidence already
  computed;
- the calendar and clock conventions.

**Conditions before Phase 4:**

1. **Unresolved specification decisions:** P3-1 (Users, Business value, Risks), P3-3 scope
   baseline, P3-5 status history, P3-6 and P3-7 visualisation fields. None blocks Phase 4; all
   block parts of 05.
2. **Incomplete acceptance criteria:**
   - the dossier is PARTIAL (P3-1);
   - WCAG is PARTIAL (no manual screen-reader audit);
   - CI is PARTIAL (no remote).
3. **Security:** no open issues. Phase 4 must keep the owner-scoped composite FK pattern for any
   new join tables.
4. **Accessibility:** the manual screen-reader pass is still outstanding from Phase 2. Do it, or
   waive it explicitly, before adding the skill radar and heatmaps.
5. **Performance:** consider paginating the Phase 1 project detail relations before Phase 4 adds
   more evidence-derived reads.
6. **Migrations:** none pending. The milestone export/import extension should be scheduled with
   the next exchange-schema change.
7. **CI:** set up CI once a remote exists.

Phase 4 has **not** been started.
