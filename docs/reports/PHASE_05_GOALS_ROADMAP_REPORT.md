# PEOS — Phase 5 Goals & Roadmap Report

Date: 2026-10-03 · Repository: `Yazan_Personal_Engineering_OS_Spec` (dedicated repo, branch `main`, no remote)

## 1. Executive Summary

Phase 5 adds **Goals & Roadmap**: persisted goals in the `01` §8 hierarchy (North Star → Annual
objective → Quarterly goal), connected to the existing projects, project milestones and
evidence-derived skills, with an explainable progress model and a roadmap built only from recorded
dates.

- **Goal domain:** lifecycle with an explicit transition table (`goal-lifecycle-v1`), a hierarchy
  that is acyclic and ≤ 3 levels by construction, acyclic dependencies, typed targets
  (metric, unit, baseline, target) and dated measurements.
- **Relationships:** Goal ↔ Project, Goal ↔ Skill (reusing Phase 4 skill intelligence unchanged),
  Goal ↔ Milestone through the existing `milestones` table (`goal_id`, no second milestone
  system, never double-counted), Goal → Goal dependencies.
- **Progress without a score:** target attainment (`goal-attainment-v1`), milestone progress and
  manual confidence are shown **side by side and never combined**. Completion is a separate user
  decision. Risk (`goal-risk-v1`) is a list of real signals, never weighted.
- **Missing data stays visible:** "Not computable", "No target configured", "No milestones
  linked", "No linked projects", "No linked skills", "Not assessable", "No deadline".
- **Views:** goals list (source list for every goal metric), goal dossier, roadmap (accessible
  quarter timeline table, quarter board, goal tree, dependency list), goal analytics.
- **Command Center:** the Active goals KPI (catalogued as unavailable since Phase 2) is now real,
  and the attention panel lists goals at risk. KPI = goal analytics = list total (tested).
- **Verification found and fixed:** a metric/list reconciliation bug (attainment population), a
  stale-statistics plan regression (1.3 s → 9 ms), and a phone-width overflow caused by an
  absolutely positioned screen-reader cell escaping a scroll region.

**Validation:** unit 214/214 · integration 124/124 (goal authorization 6/6) · E2E 71/71 · axe
call sites 37/37 (Phase 5: 8 sites, 13 page scans) · build, typecheck, lint, formatting, Prisma,
fresh migration and drift **PASS** · dependency audit **PARTIAL** (unchanged dev-only advisory).

**Phase 6 readiness:** **READY WITH CONDITIONS** (§38).

## 2. Scope Implemented

| Phase 5 scope (08 / prompt)    | Implemented                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Persisted goals                | `goals` table, CRUD API, create/edit dialogs (ADR 0031)                                                   |
| Goal hierarchy                 | Strict level rank, depth ≤ 3, same owner, deletion refused while children exist; tree view                |
| Goal lifecycle                 | `goal-lifecycle-v1` transition table; lifecycle actions in the dossier; completion date rules             |
| Goal ↔ Skill                   | `goal_skills`; Phase 4 rows reused (same values as the skill dossier)                                     |
| Goal ↔ Project                 | `goal_projects`; status and manual health in the dossier                                                  |
| Goal ↔ Milestone               | `milestones.goal_id` (Goal 1:N Milestone); 409 on double linking                                          |
| Dependencies                   | `goal_dependencies`; cycle rejection; risk signal; roadmap list                                           |
| Typed targets and attainment   | metric, unit, baseline, target; `goal_measurements`; `goal-attainment-v1`                                 |
| Progress / completion / health | Attainment, milestone progress and confidence separate; completion separate; risk from signals (ADR 0033) |
| Roadmap                        | Timeline table, quarter board, goal tree, dependency list, undated list; URL window (ADR 0035)            |
| Goal analytics and catalogue   | 16 new metrics + `goals.active` v2 (76 metrics, 66 available); `/goals/analytics`                         |
| Command Center                 | Active goals KPI, goals-at-risk attention, drill-downs, activity entries                                  |
| API, audit, authorization      | 12 route handlers, Zod, audit in transaction, composite FKs, two-user IDOR tests                          |
| Tests, docs, ADRs              | +24 unit, +17 integration, +19 E2E, +8 axe call sites; ADRs 0031–0035; docs (§33)                         |

## 3. Explicitly Not Implemented

| Item                                                       | Reason                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Actions / Tasks (`01` §8 lowest level, `04` Goal 1:N Task) | No Task entity exists; out of Phase 5 scope                            |
| Goal ↔ Evidence (`00` §5)                                  | Not in `04`; evidence reaches goals through projects and skills        |
| Composite progress score, goal health score                | Would require invented weighting (absolute rule)                       |
| "Expected progress" from elapsed time                      | Assumes linear progress the spec does not define                       |
| Per-goal skill target level, skill importance              | Not in the spec; not invented                                          |
| Goal priority                                              | Not in `04`                                                            |
| Fiscal quarters, Gantt drawing, dependency graph drawing   | Not justified (ADR 0035)                                               |
| Goal activity tab in the dossier                           | Goal events appear in the Command Center activity feed; deferred (§35) |
| Goals in the JSON/CSV exchange format                      | Exchange-format extension (§35)                                        |
| AI, Learning, Architecture, integrations                   | Phases 6–9 / unscheduled (absolute rule)                               |

## 4. Repository / Commit Information

Before each commit the checks were `pwd`, `git status`, `git branch` and `git remote -v`. They
confirmed:

- the root is `C:/Users/Lenovo/Desktop/yazan/Yazan_Personal_Engineering_OS_Spec`;
- the branch is `main`;
- there is no remote.

Files were staged by explicit path; `git add -A` was never used. **Nothing was pushed.** The
home-folder repository was not modified.

| Commit    | Content                                                                                |
| --------- | -------------------------------------------------------------------------------------- |
| `067f8f3` | Goal domain, hierarchy, lifecycle, relationships and roadmap rules (schema, migration) |
| `e72e293` | Goal API, analytics, metric catalogue and Command Center integration                   |
| `ab16b5d` | Goals UI, dossier, roadmap, analytics views and E2E                                    |
| _(final)_ | ADRs 0031–0035, documentation, the 1440 px E2E test and this report                    |

## 5. Existing Domain Before Phase 5

- **Projects** (Phase 1/3): lifecycle status, manual health, computed health
  (`project-health-v1`), milestones with `planned · in_progress · blocked · completed · cancelled`
  and the Phase 3 overdue rule (open, due before today, project not archived).
- **Skills** (Phase 1/4): target level, evidence-derived level (`skill-level-v1`), freshness,
  trend, gap and critical gap (`gap-analysis-v1`), computed by `analyseSkills`.
- **Analytics** (Phase 2–4): metric catalogue (60 metrics, 49 available), `MetricResult`
  contract, drill-down invariant, Command Center. `goals.active` was catalogued as **unavailable
  — Phase 5**; the Goals navigation entry was "unavailable".
- **Calendar:** `src/modules/shared/calendar.ts` (UTC calendar day, injectable clock).
- `04` already defined `Milestone.goalId`; ADR 0022 deferred it to Phase 5.

## 6. New Goal Domain

| Table / column       | Purpose                                    | Ownership                                           |
| -------------------- | ------------------------------------------ | --------------------------------------------------- |
| `goals`              | The goal and its typed target              | `user_id`; composite self-FK `(parent_id, user_id)` |
| `goal_projects`      | Contributing projects                      | Composite FKs to goal and project                   |
| `goal_skills`        | Required skills                            | Composite FKs to goal and skill                     |
| `goal_dependencies`  | "Goal depends on goal"                     | Composite FKs to both goals                         |
| `goal_measurements`  | Dated observed values                      | Composite FK to goal                                |
| `milestones.goal_id` | The goal a project milestone counts toward | Composite FK `(goal_id, user_id)`, `NO ACTION`      |

Goal fields: `title`, `type`, `parentId`, `description`, `outcome`, `metric`, `unit`, `baseline`,
`target`, `startDate`, `deadline`, `status`, `completedAt`, `confidence`. Field limits mirror the
Zod schemas; `userId` is never accepted from the client.

## 7. Goal Lifecycle

`goal-lifecycle-v1` (ADR 0031): draft → active / cancelled; active → on hold / completed /
cancelled; on hold → active / completed / cancelled; completed → active (reopen); cancelled →
draft / active (restore). Same-status updates are allowed. Invalid transitions return 400 on
`status`.

- **Completion:** `completed ⇔ completedAt` (DB check). Default today (UTC); past allowed; future
  and stray dates rejected; reopening clears it. The audit verb is `goal.completed` /
  `goal.reopened` / `goal.updated`.
- **Overdue:** an open goal whose deadline is strictly before today (UTC). Unit-tested at the day
  boundary.
- **UI:** the dossier shows only the allowed transitions as buttons ("Activate", "Put on hold",
  "Mark completed" with a date dialog, "Cancel goal", "Reopen", "Restore as draft"). E2E walks
  draft → active → completed → reopened → cancelled → draft.

## 8. Goal Hierarchy

- A parent must be a **strictly higher** level; levels may be skipped. Strict rank makes cycles
  impossible and bounds depth at 3 without a recursive query.
- Changing a goal's type is rejected when its children would no longer be below it.
- The parent must be the caller's own goal (service 400 + composite FK). A goal cannot be its own
  parent (check constraint).
- **Deletion** is refused with 409 while children exist; the user moves or deletes them first.
- **UI:** "Add child goal" offers only lower levels; "Change parent" offers only higher-level
  goals; the roadmap shows the tree as nested lists.

## 9. Goal ↔ Skill

- `goal_skills` links. The goal's skill readiness comes from the **same** Phase 4 `analyseSkills`
  call — derived level, the skill's own target, gap state, critical gap, freshness. Phase 4 logic
  is not duplicated.
- The dossier table shows those Phase 4 rows; an integration test asserts they equal the skill
  intelligence API, and E2E asserts the level text equals the skill dossier.
- Signals used by goals: `below` (list filter `skillGap`) and `critical` (risk signal).
- No per-goal target level and no skill importance exist (not in the spec).

## 10. Goal ↔ Project

- `goal_projects` links ("contributes to"). The dossier lists status and **manual** health.
- Project signals: `total`, `delivered` (completed or production/maintenance) and
  `atRiskOrBlocked` (manual health at risk or blocked, project not archived) — the latter is a
  risk signal. Computed project health is not mixed into goals.

## 11. Goal ↔ Milestone

- Uses the existing `milestones` table: `goal_id` (nullable) — **no duplicate milestone system**.
- A milestone counts toward one goal only; linking it elsewhere returns 409 ("Unlink them there
  first"), so milestone progress is never double-counted across goals.
- Milestones keep their project, lifecycle and the Phase 3 overdue rule; deleting a goal only
  unlinks them.

## 12. Goal Target Model

- `metric` (≤ 120 chars), `unit` (≤ 30), `baseline` and `target` (finite numbers within ±10¹²),
  all optional.
- Measurements: `date` (not in the future), finite `value`, optional `note`; at most 1,000 per
  goal; recording requires a baseline and a target (400 otherwise).
- Direction is implied by `target − baseline`: a target below the baseline means lower is better
  (e.g. latency). Target = baseline makes progress undefined (not computable).

## 13. Progress Semantics

Three separate views (ADR 0033), never combined:

| View                         | Formula / source                                                               | Missing data                     |
| ---------------------------- | ------------------------------------------------------------------------------ | -------------------------------- |
| Target attainment (derived)  | `(latest − baseline) / (target − baseline)`, latest measurement dated ≤ today  | "Not computable" with the reason |
| Milestone progress (derived) | completed ÷ non-cancelled linked milestones; overdue and blocked counts listed | "No milestones linked"           |
| Confidence (manual)          | low / medium / high as entered                                                 | "Not set"                        |

Every percentage is shown with its explanation, e.g. "Latest 150 ms on 2026-09-01: 50% of the
way from 200 ms to 100 ms."

## 14. Manual vs Derived Progress

- **Manual:** status, completion and its date, confidence, project manual health.
- **Derived:** overdue, attainment, milestone progress, risk and its signals, skill readiness.
- Derived values are computed on request, never stored, and never overwrite manual values.
  Confidence is never read by any calculation. The UI labels each value "(manual)" or
  "(derived)".

## 15. Goal Completion Semantics

- Completion is the user's decision (`status = completed` with `completedAt`).
- An attained target does **not** complete a goal, and a completed goal keeps its real
  attainment state (E2E: a completed goal still shows "Not computable").
- Completed goals are not open: not overdue, risk "not applicable".
- Completion rate (ADR 0034) = completed ÷ (completed + overdue).

## 16. Goal Health

There is **no goal health score**. "Health" is `goal-risk-v1`: an open goal is at risk when at
least one real signal exists — overdue, overdue linked milestones, blocked linked milestones,
contributing projects marked at risk/blocked, linked skills with a critical gap, cancelled or
overdue dependencies, regressed attainment. Signals are listed with counts. Without any
assessable input the goal is "not assessable", not "on track". Drafts and closed goals are "not
applicable".

## 17. Roadmap

ADR 0035. `GET /api/v1/goals/roadmap?from&to` and `/goals/roadmap`:

- **Calendar:** UTC calendar days and calendar quarters; default window previous quarter through
  the next six; at most 5 years / 40 quarters; the window is kept in the URL (E2E reload).
- **Timeline:** a semantic table (goal rows × quarter columns, text in every cell: "Starts …",
  "Due …", "In progress" only between a recorded start and deadline). Overdue goals are always
  included. Focusable horizontal scroll region with a sticky goal column. ≤ 500 rows.
- **Quarter board:** goals grouped by deadline quarter.
- **Goal tree:** nested lists.
- **Dependencies:** "A depends on B" list (a graph drawing is not justified).
- **Undated open goals:** count, first 50 and a link to the filtered list.
- **List alternative:** the goals list sorted by deadline is the list view of the same data.

## 18. Goal Analytics

`GET /api/v1/analytics/goals` and `/goals/analytics`:

- KPIs: goals, active, overdue, at risk, completion rate, target attainment; coverage: open goals
  without deadline / projects / skills, open goals with skill gaps.
- Charts (ECharts, SVG, with data table and CSV): open goals by risk, deadline load, goals by
  status, attainment states. The at-risk attention list names each goal's signals.
- Every number links to the exact goals list (ADR 0034); bars are clickable; tables carry links.

## 19. Target Attainment Metrics

- `goals.target_attainment` = attained ÷ measurable **committed** goals (committed = active, on
  hold or completed; measurable = attainment computable). Breakdown: attained, not yet attained.
  No measurable goal → `insufficient_data`, never 0 %.
- `goals.attainment_distribution`: committed goals by state (attained, in progress, regressed,
  not computable). Drill-downs add `committed=true`.
- **Bug found and fixed:** the first implementation counted committed goals in the metric but the
  drill-down list included drafts and cancelled goals. The `committed` filter was added to the
  schema, the SQL `where`, the analytics predicate and the drill-downs; the reconciliation test
  now covers it.

## 20. Command Center Integration

- KPI `goals.active` (status active), computed by the goal analytics service — the integration
  test asserts Command Center value = analytics value = list total; E2E asserts the same value in
  the UI and the drill-down to `/goals?status=active`.
- The attention panel lists goals at risk with their signals.
- The activity feed shows goal and measurement events with links (`/goals/:id`,
  `/goals/:id#measurements`).
- The Command Center note lists what is still unavailable (AI experiments, architecture
  decisions, technical debt).

## 21. Metric Catalogue Changes

- `goals.active`: unavailable → **available** (version 2, revised 2026-10-03).
- New (version 1, all available): `goals.total`, `goals.overdue`, `goals.completion_rate`,
  `goals.at_risk`, `goals.on_track`, `goals.risk_distribution`, `goals.status_distribution`,
  `goals.target_attainment`, `goals.attainment_distribution`, `goals.without_deadline`,
  `goals.without_projects`, `goals.without_skills`, `goals.with_skill_gaps`,
  `goals.deadline_load`, `goals.milestone_progress`, `goals.burndown`.
- Totals: **76 metrics, 66 available** (was 60 / 49). Owner `goals` added.
- Each entry states definition, formula, source, frequency, owner, caveats, value type, temporal
  semantics, drill-down, spec reference and version. `docs/architecture/metric-catalogue.md` was
  regenerated from code. No existing formula changed.

## 22. API Surface

| Method               | Path                                  | Notes                                                |
| -------------------- | ------------------------------------- | ---------------------------------------------------- |
| GET · POST           | `/api/v1/goals`                       | Source list (filters, sort, page ≤ 100) · create     |
| GET · PATCH · DELETE | `/api/v1/goals/:id`                   | Record · update (rules) · delete (409 with children) |
| GET                  | `/api/v1/goals/:id/intelligence`      | Dossier                                              |
| PUT                  | `/api/v1/goals/:id/projects`          | Replace set                                          |
| PUT                  | `/api/v1/goals/:id/skills`            | Replace set                                          |
| PUT                  | `/api/v1/goals/:id/dependencies`      | Replace set; cycles 400                              |
| PUT                  | `/api/v1/goals/:id/milestones`        | Replace set; 409 when linked elsewhere               |
| GET · POST           | `/api/v1/goals/:id/measurements`      | List · record                                        |
| DELETE               | `/api/v1/goals/:id/measurements/:mid` | Delete                                               |
| GET                  | `/api/v1/goals/roadmap`               | Window ≤ 5 years                                     |
| GET                  | `/api/v1/analytics/goals`             | Goal analytics                                       |

PEOS conventions (ADR 0015): `defineUserRoute` (session, same-origin for mutations, rate limits —
reads use `analytics`, 120/min), Zod validation, malformed ids → 404, foreign targets → 400,
`{ data }` / `{ data, page }` envelopes. Details: `docs/architecture/api.md`.

## 23. Database Changes

- Tables: `goals`, `goal_projects`, `goal_skills`, `goal_dependencies`, `goal_measurements`;
  column `milestones.goal_id`; enums `goal_type`, `goal_status`, `goal_confidence`.
- Composite-FK ownership on every reference; cascades only from a goal to its own links and
  measurements; `NO ACTION` for parent and milestone references.
- Check constraints: `goals_title_not_blank_chk`, `goals_completion_chk`, `goals_dates_chk`,
  `goals_not_own_parent_chk`, `goal_dependencies_not_self_chk`, `goal_measurements_finite_chk`.
- Indexes: `goals(user_id, status, deadline)`, `goals(parent_id)`, `goals(id, user_id)` unique,
  `goal_projects(project_id)`, `goal_skills(skill_id)`,
  `goal_dependencies(depends_on_goal_id)`, `goal_measurements(goal_id, date)`,
  `milestones(goal_id)`. Only tables Phase 5 needs were added.

## 24. Migrations

`prisma/migrations/20261003061121_goals_roadmap/migration.sql`:

- Additive only — `CREATE TYPE`, `CREATE TABLE`, `ADD COLUMN` (nullable), indexes, FKs, checks.
  No `DROP`, `DELETE`, `TRUNCATE` or data rewrite (`ON DELETE` appears only in FK clauses).
- Deterministic (Prisma-generated plus hand-appended named checks).
- Applied to `peos` and `peos_test`; `prisma migrate status`: up to date.
- **From zero:** a fresh database `peos_fresh` received all 5 migrations; `migrate diff
--from-config-datasource --exit-code` returned 0 (no drift); the integration suite passed
  124/124 on it; the database was dropped afterwards.
- No seed data.

## 25. Authorization / User Isolation

- Owner from the session only; `userId` / `ownerId` in bodies are stripped.
- Composite FKs make cross-user links impossible at the database level.
- `tests/integration/goals-authz.int.test.ts` (6 HTTP tests, two real users):
  1. every goal endpoint requires a session (401);
  2. Bob cannot read, update, delete or analyse Alice's goal, intelligence or measurements (404);
  3. Bob cannot replace Alice's goal relationships (404);
  4. Bob cannot attach Alice's project, skill, milestone, parent or dependency goal to his goal
     (400);
  5. injected owner ids are ignored; Bob's list, roadmap and analytics never contain Alice's goals;
  6. invalid input and malformed ids are rejected without leaking.
- E2E: a second account sees "Goal not found", 404 from three goal APIs, 404 on a relation PUT,
  and an empty list.
- Aggregates repeat the owner on every join; four parameterised raw queries; no
  `$queryRawUnsafe`.

## 26. Audit Logging

All mutations are audited inside their transaction (`auditInTx`):

| Event                                                   | Snapshot                                  |
| ------------------------------------------------------- | ----------------------------------------- |
| `goal.created` / `goal.updated` / `goal.deleted`        | Goal fields (no owner ids)                |
| `goal.completed` / `goal.reopened`                      | Before / after status and completion date |
| `goal.relations_updated`                                | Sorted before/after id lists per relation |
| `goal_measurement.created` / `goal_measurement.deleted` | Date, value, note                         |

The integration lifecycle test asserts the exact audit sequence. Derived analytics are not
audited.

## 27. UX / UI

- **Pages:** `/goals` (list), `/goals/:id` (dossier), `/goals/roadmap`, `/goals/analytics`; tabs
  Goals | Roadmap | Analytics; Goals navigation now available.
- **Create/edit:** dialogs with typed number fields (baseline, target, values); create offers
  draft or active; edit leaves lifecycle to the explicit actions; "Add child goal" restricts the
  level.
- **Dossier:** header badges (status, overdue, risk, completion), lifecycle actions, section nav,
  goal facts, risk panel with signals, progress (three separate facts with explanations),
  measurements (burndown with baseline/target lines, table, add/delete), milestones, projects,
  hierarchy (change parent, add child), skills (Phase 4 table), dependencies (both directions).
- **States:** skeletons while loading; error state with retry; "Goal not found" for missing or
  foreign goals; empty states ("No goals yet." on list, roadmap and analytics); missing-data
  states (§1).
- **Design system:** existing `ResourceList`, `Panel`, `ChartCard`, `EChart`, `KpiCard`,
  `RelationPicker`, `EntityFormDialog`, badges and tokens. Shared changes: a `number` field kind,
  `editFields` on `ResourceList`, an `exclude` option on `RelationPicker` (a goal cannot pick
  itself as a dependency), and a scroll container for wide list tables.
- **Responsive (E2E, no horizontal page scroll):** 375 px (list, dossier, roadmap, analytics,
  each with axe), 768 px (list, dossier, roadmap) and 1440 px (all four).

## 28. Accessibility

Target: WCAG 2.2 AA.

| Check                                 | Result                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated axe (WCAG 2.0/2.1/2.2 A/AA) | **37 call sites, 0 violations.** Phase 5 adds 8 sites (13 page scans): list, dossier ×2, roadmap, analytics, dark ×3, mobile ×4, empty account |
| Keyboard (E2E)                        | Definition dialog via Enter, Escape returns focus; "Manage dependencies" dialog returns focus; filter by arrow keys                            |
| Charts                                | `role="img"` summaries + data tables with links + CSV; decal patterns                                                                          |
| Timeline                              | Semantic table with captions, row headers and text in every cell; focusable scroll region                                                      |
| Forms                                 | Labels, field errors, server errors (`role="alert"`), submission state                                                                         |
| Colour                                | Status, risk and attainment always have text; colour only reinforces                                                                           |
| Phone overflow fix                    | An absolutely positioned `sr-only` header cell escaped its scroll region; scroll regions are now `relative`                                    |
| Manual screen-reader audit            | **Not performed** (PARTIAL)                                                                                                                    |

## 29. Performance

Dataset (one user): 1,000 goals; 5,000 goal relationships (2,000 goal–project, 1,500 goal–skill,
500 dependencies, 1,000 milestone links); 1,002 measurements; 1,000 projects; 3,000 milestones;
150 skills; 12,000 evidence items with 12,000 skill links (Phase 4 volume); 50,000 audit rows.
PostgreSQL 17.10, service layer, 1 warm-up + 10 timed runs; median = mean of runs 5 and 6.

| Call (median / max ms)                 | Run a (`ANALYZE`) | Run b (no `ANALYZE`) | Run c (no `ANALYZE`) |
| -------------------------------------- | ----------------- | -------------------- | -------------------- |
| Goal list (page 1, sort deadline)      | 78.2 / 107.4      | 77.5 / 116.3         | 89.8 / 115.6         |
| Goal list (at risk, sort risk)         | 78.7 / 83.5       | 73.3 / 78.7          | 78.0 / 92.2          |
| Goal list (search + open)              | 39.1 / 50.3       | 40.7 / 43.8          | 39.3 / 45.0          |
| Goal detail (record)                   | 2.6 / 3.2         | 3.5 / 4.4            | 2.3 / 2.5            |
| Goal intelligence (dossier)            | 47.3 / 67.8       | 48.8 / 83.9          | 47.8 / 69.4          |
| Goal analytics                         | 82.8 / 87.9       | 83.4 / 102.6         | 79.1 / 91.6          |
| Roadmap (default window)               | 75.9 / 92.8       | 80.2 / 100.2         | 75.6 / 86.1          |
| Roadmap (5-year window)                | 78.8 / 103.5      | 82.5 / 94.7          | 78.9 / 90.5          |
| Command Center dashboard               | 114.8 / 152.9     | 128.2 / 137.7        | 120.1 / 130.5        |
| Skill intelligence list (Phase 4 path) | 25.9 / 29.1       | 26.3 / 30.1          | 26.1 / 29.5          |

**Optimisations made during benchmarking (verified):**

1. **Dossier skill analysis ran twice** (once for signals, once for the table). It now runs once
   (`analyseGoalsWithSkills`). Dossier: 70.2 → 47 ms.
2. **Unfiltered analyses sent 1,000-id `IN` lists** to six aggregates; they now scope by owner.
   Goal list: 93.8 → 78 ms; analytics 102.7 → 83 ms.
3. **Planner statistics.** Without `ANALYZE` an earlier run measured the dossier at 1,373.6 ms.
   A per-query breakdown in the same state showed `project.findMany({ goals: { some } })` at
   1,318.6 ms while the same rows read from `goal_projects` by primary key took 9.2 ms. The
   dossier now reads from the link table; runs b and c (no `ANALYZE`) match run a. Earlier
   no-`ANALYZE` runs also measured the goal list at 163–184 ms before change 2; that did not
   recur. Other relation filters in `goalWhere` (`projectId`, `skillId`, `hasProjects`,
   `hasSkills`) still use `some` and depend on statistics — documented as a risk (§36).

**Query strategy:** one goal query + six parallel aggregates + one Phase 4 skill analysis for any
number of goals (no N+1); the dossier adds eight bounded lookups. All lists are paginated (≤ 100);
the roadmap is capped (500 timeline rows, 50 undated shown, 40 quarters); measurements ≤ 1,000
per goal. No caching; only the indexes of the new tables were added.

## 30. Testing

| Suite                   | Result       | Phase 5 additions                                           |
| ----------------------- | ------------ | ----------------------------------------------------------- |
| Unit                    | **214/214**  | +24: `goal.rules.test.ts` 17, `goal-intelligence.test.ts` 7 |
| Integration             | **124/124**  | +17: `goals.int.test.ts` 11, `goals-authz.int.test.ts` 6    |
| Authorization (subset)  | **46/46**    | +6                                                          |
| E2E                     | **71/71**    | +19: `phase5.spec.ts`                                       |
| Accessibility (axe)     | **37/37**    | +8 call sites (13 page scans), 0 violations                 |
| Regression (Phases 0–4) | **All pass** | Unit 190, integration 107, E2E 52 within the totals         |

**Unit:** hierarchy (levels, self/lower parents, depth, type change with children), dependency
cycles (self, direct, indirect, large graphs), the transition table, completion dates, overdue at
the UTC boundary, attainment (both directions, all not-computable reasons, units), every risk
signal, not assessable / not applicable, validation (owner ids stripped, finite numbers, date
order, roadmap window), UTC quarters, deterministic ordering for every sort, list/metric
predicate equivalence, drill-down URLs including every deadline-load bucket form.

**Integration:** lifecycle with the exact audit sequence; hierarchy rules and deletion refusal;
acyclic owner-scoped dependencies; the dossier from real records with Phase 4 equality;
dependency risk and "not assessable"; measurement rules; **every goal metric and bucket = its
drill-down list total**; Command Center equality; empty-account no-data states; server-side
filters, sort and pagination; roadmap placement, undated list, tree and edges; database
constraints (through the service and direct writes).

**E2E coverage of the 24 required flows** (`phase5.spec.ts`):

| #   | Flow                         | Test                                                                       |
| --- | ---------------------------- | -------------------------------------------------------------------------- |
| 1   | Goal list works              | "1, 2: the goal list works…"                                               |
| 2   | Create goal                  | same (dialog → row)                                                        |
| 3   | Edit goal                    | "3, 11: editing sets a typed target…"                                      |
| 4   | Goal dossier                 | "4, 7, 8, 9, 10: the dossier links…" (+ axe)                               |
| 5   | Goal lifecycle               | "5: lifecycle transitions follow the table…"                               |
| 6   | Goal hierarchy               | "6: hierarchy — child goals, parent links and level rules" (+ 409 delete)  |
| 7   | Skill relationship           | dossier test (Manage skills → Phase 4 row)                                 |
| 8   | Project relationship         | dossier test                                                               |
| 9   | Milestone relationship       | dossier test ("Milestones (2)", overdue)                                   |
| 10  | Derived progress             | dossier test ("1 of 2 completed", "50% of linked milestones · 1 overdue")  |
| 11  | Target attainment            | "3, 11" ("In progress · 50%", explanation, burndown chart)                 |
| 12  | Roadmap                      | "12, 14: roadmap timeline, quarter board, tree and dependencies" (+ axe)   |
| 13  | Filters                      | "13, 14: list filters are server-side…"                                    |
| 14  | URL persistence              | same (reload keeps `risk`) + roadmap window reload                         |
| 15  | Empty state                  | "15, 20: a new account sees empty states…" (+ axe)                         |
| 16  | Missing-data state           | "16: missing data is explicit, never zero" (+ axe)                         |
| 17  | Mobile                       | "17: … fit a phone" (4 pages, axe each); tablet 768; wide desktop 1440     |
| 18  | Dark theme                   | "18: dark theme…" (3 pages, axe each)                                      |
| 19  | Keyboard                     | "19: keyboard — definitions, pickers and filters…"                         |
| 20  | Cross-user isolation         | "15, 20" (Goal not found, 404 APIs, empty list)                            |
| 21  | Command Center KPI           | "21, 22: the Command Center KPI equals goal analytics…"                    |
| 22  | KPI drill-down               | same (→ `/goals?status=active`, live-region count) + analytics KPI test    |
| 23  | Phase 4 skill intelligence   | "23: goal skill rows equal the Phase 4 skill intelligence" + `phase4.spec` |
| 24  | Phase 3 project intelligence | "24: Phase 3 project intelligence is unchanged" + `phase3.spec`            |

**Changes to existing tests (requirement changed, not weakened):**

- `navigation.test.ts`: "goals" joins the available sections (Phase 5 makes Goals available).
- `drilldown.test.ts`: the "no drill-down for unavailable metrics" check now uses `ai.experiments`
  instead of `goals.active` (now available, with a mapping); a sample bucket for
  `goals.deadline_load` was added so the every-bucket test covers it.
- `analytics.test.ts`: catalogue counts 76 / 66.
- `phase2.spec.ts`: the catalogue page check expects "Unavailable — Phase 6" instead of "Phase 5";
  it still asserts that unavailable metrics are shown.

## 31. Validation

```
Unit:                 214/214 (22 files)
Integration:          124/124 (16 files)
Authorization:        46/46 (goal authorization 6/6)
E2E:                  71/71
Accessibility (axe):  37/37 call sites, 0 violations
Build:                PASS
Typecheck:            PASS (next typegen + tsc)
Lint:                 PASS (0 warnings)
Formatting:           PASS
Prisma format:        PASS
Prisma validation:    PASS
Prisma generate:      PASS
Fresh migration:      PASS (5 migrations; integration 124/124 on the fresh DB)
Migration drift:      PASS (exit 0)
Migration status:     up to date
Dependency audit:     PARTIAL — 1 high: braces <=3.0.3 (GHSA-vfj7-8cjw-p6xm) via eslint-config-next
                      (lint-only dev dependency, unchanged since Phase 4, no patched release).
                      `pnpm audit --prod`: no known vulnerabilities.
CI:                   NOT RUN — no remote or CI (not configured, by instruction)
Manual screen-reader: NOT RUN — requires a human with NVDA/VoiceOver
```

## 32. Acceptance Criteria

| Area          | Criterion                                   | Status  | Evidence                                                              |
| ------------- | ------------------------------------------- | ------- | --------------------------------------------------------------------- |
| Goals         | Persisted goals, CRUD                       | PASS    | §6, §22; integration + E2E                                            |
| Goals         | Hierarchy (no cycles, bounded, same owner)  | PASS    | §8; unit + integration + E2E                                          |
| Goals         | Defined deletion behaviour                  | PASS    | 409 with children; milestones unlinked (ADR 0031)                     |
| Goals         | Lifecycle                                   | PASS    | §7; transition table tests                                            |
| Goals         | Goal ↔ Skill via Phase 4                    | PASS    | §9; equality tests                                                    |
| Goals         | Goal ↔ Project                              | PASS    | §10                                                                   |
| Goals         | Goal ↔ Milestone, no double counting        | PASS    | §11; 409                                                              |
| Goals         | Dependencies                                | PASS    | Cycle rejection; risk signal; roadmap list                            |
| Goals         | Typed targets, documented attainment        | PASS    | §12, §19; ADR 0033/0034; catalogue                                    |
| Goals         | Explainable progress, no composite          | PASS    | §13                                                                   |
| Goals         | Manual vs derived separate                  | PASS    | §14                                                                   |
| Goals         | Completion separate from progress           | PASS    | §15; E2E                                                              |
| Goals         | Health from real signals only               | PASS    | §16                                                                   |
| Goals         | Actions / Tasks level                       | N/A     | No Task entity (P5-4)                                                 |
| Roadmap       | Timeline, quarter board, tree, deps         | PASS    | §17                                                                   |
| Roadmap       | List alternative, UTC strategy              | PASS    | §17; ADR 0035                                                         |
| Analytics     | Goal metrics governed by the catalogue      | PASS    | §21; governance tests                                                 |
| Analytics     | Command Center KPI (same service)           | PASS    | §20; equality tests                                                   |
| Analytics     | Drill-down invariant                        | PASS    | Every metric and bucket = list total (integration); mapping unit test |
| Analytics     | Empty / missing-data states                 | PASS    | Integration + E2E                                                     |
| Security      | Authentication                              | PASS    | 401 tests                                                             |
| Security      | Authorization / IDOR (two real users)       | PASS    | §25                                                                   |
| Security      | Validation                                  | PASS    | Zod + DB checks; 400 tests                                            |
| Security      | Audit of mutations                          | PASS    | §26                                                                   |
| Database      | Only needed tables, composite FKs           | PASS    | §23                                                                   |
| Database      | Non-destructive, deterministic migration    | PASS    | §24                                                                   |
| Database      | Migration from zero                         | PASS    | §24                                                                   |
| UX            | Pages, dossier, roadmap, create/edit        | PASS    | §27                                                                   |
| UX            | Loading / empty / error / missing states    | PASS    | §27                                                                   |
| UX            | Responsive 375 / 768 / 1440                 | PASS    | E2E overflow checks                                                   |
| UX            | Light/dark                                  | PASS    | Dark axe on 3 surfaces                                                |
| Accessibility | Automated axe                               | PASS    | 37/37                                                                 |
| Accessibility | Keyboard, focus, tables, chart alternatives | PASS    | §28                                                                   |
| Accessibility | Manual screen reader                        | PARTIAL | See below                                                             |
| Engineering   | Build / typecheck / lint / formatting       | PASS    | §31                                                                   |
| Engineering   | Performance benchmark                       | PASS    | §29 (planner effects documented)                                      |
| Engineering   | Dependency audit                            | PARTIAL | See below                                                             |
| Engineering   | Documentation and ADRs                      | PASS    | §33                                                                   |
| Engineering   | Regression Phases 0–4                       | PASS    | §37                                                                   |
| Global        | CI                                          | PARTIAL | See below                                                             |

**PARTIAL items:**

| Item                 | Reason                                               | Impact                                                       | Blocks Phase 6? | Follow-up                                             |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------ | --------------- | ----------------------------------------------------- |
| Manual screen reader | Needs a human with NVDA/VoiceOver; not claimed       | Automated checks cannot confirm announcement quality         | No              | Run an NVDA + VoiceOver pass over Phases 2–5 surfaces |
| Dependency audit     | `braces <=3.0.3` in lint tooling; no patched release | Development-time only; not shipped; no user input reaches it | No              | Add an override when `braces@3.0.4` is published      |
| CI                   | No remote, by instruction                            | Checks run locally only                                      | No              | Configure CI once a remote exists                     |

## 33. ADRs

| ADR  | Title                                                                        | Status   |
| ---- | ---------------------------------------------------------------------------- | -------- |
| 0031 | Goal lifecycle, hierarchy and deletion (goal-lifecycle-v1)                   | Accepted |
| 0032 | Goal relationships: projects, skills, milestones, dependencies, measurements | Accepted |
| 0033 | Goal progress, target attainment and risk (goal-attainment-v1, goal-risk-v1) | Accepted |
| 0034 | Goal analytics, completion rate and drill-down reconciliation                | Accepted |
| 0035 | Roadmap temporal semantics                                                   | Accepted |

**Updated docs:** `docs/architecture/domain-model.md`, `api.md`, `analytics.md` (incl. Phase 5
performance), `metric-catalogue.md` (regenerated from code), `security-baseline.md`,
`docs/DEVELOPMENT.md`, `docs/SPECIFICATION_INDEX.md` (C6 and P3-8 updated; P5 gaps),
`docs/decisions/README.md`. The prompt names `docs/security-baseline.md`; the repository's file is
`docs/architecture/security-baseline.md`, and that file was updated.

## 34. Specification Gaps

| ID    | Gap                                                                    | Handling                                      |
| ----- | ---------------------------------------------------------------------- | --------------------------------------------- |
| P5-1  | `10` has no Goals section; `12_IMPLEMENTATION_GUIDE.md` does not exist | Acceptance from `08` Phase 5 and the prompt   |
| P5-2  | Goal status values undefined                                           | ADR 0031                                      |
| P5-3  | Hierarchy rules undefined                                              | Strict level rank (ADR 0031)                  |
| P5-4  | Action level / Goal 1:N Task — no Task entity                          | Deferred                                      |
| P5-5  | Goal → Evidence in `00` §5, not in `04`                                | Deferred                                      |
| P5-6  | On-track, at-risk, target attainment undefined                         | ADR 0033                                      |
| P5-7  | Burndown needs measurement history                                     | `goal_measurements` (ADR 0032)                |
| P5-8  | No start date in `04`                                                  | Optional `startDate` (ADR 0035)               |
| P5-9  | No per-goal skill target or importance                                 | Phase 4 target and gap used; nothing invented |
| P5-10 | `confidence` semantics undefined                                       | Manual only, never calculated with (ADR 0033) |
| P5-11 | Completion-rate denominator undefined                                  | completed ÷ (completed + overdue) (ADR 0034)  |
| P5-12 | Priority not in `04`                                                   | Not added                                     |

## 35. Deferred Features

| Feature                                              | Deferred to / blocked by                                     |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Actions / Tasks under goals                          | Spec decision (Task entity)                                  |
| Goal ↔ Evidence                                      | Spec decision (how it counts)                                |
| Goal activity tab in the dossier                     | UI follow-up (events already audited and in the feed)        |
| Goals, links and measurements in the exchange format | Exchange-format extension (with milestones and level models) |
| Time-based expected progress, forecasting            | Spec decision; would need a non-linear model                 |
| Fiscal quarters, Gantt / dependency drawings         | Not justified yet (ADR 0035)                                 |
| AI goal suggestions                                  | Copilot / AI phases                                          |

## 36. Risks

1. **Risk signals are a convention.** goal-risk-v1 lists signals without weighting; a user may
   disagree that a single overdue milestone means "at risk". Mitigation: every signal is shown
   with its count; versioned rules.
2. **Attainment trusts recorded measurements.** Wrong values give wrong attainment. Mitigation:
   measurements are audited, dated, deletable and listed beside the chart.
3. **Planner statistics.** Relation filters that use `some` (`projectId`, `skillId`,
   `hasProjects`, `hasSkills`) can slow down after bulk imports until autovacuum analyses the
   tables. Mitigation: autovacuum; consider `ANALYZE` after large imports; the dossier path was
   already moved to the link table.
4. **Whole-set analysis per list request.** The goal list analyses every goal (≤ 2,000 per user)
   to filter and sort by derived fields: about 80 ms at 1,000 goals. Mitigation: the cap; revisit
   if limits grow.
5. **Exchange format does not include goals yet**, so export/import is not round-trip for Phase 5
   data.
6. **Dependency advisory** in lint tooling; **no CI**; **no manual screen-reader audit**.

## 37. Phase 0–4 Regression Status

**No regression.** All earlier suites pass inside the totals: unit 190/190 and integration 107/107
of the pre-Phase-5 tests, and E2E smoke 8, Phase 1 10, Phase 2 10, Phase 3 10, Phase 4 14.

| Phase | Verified                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Authentication, ownership, shell, themes, security headers, health (smoke 8/8)                                                   |
| 1     | Profile, projects, skills, certifications, technologies, evidence, relationships, import/export (Phase 1 E2E 10/10; integration) |
| 2     | Command Center, metric catalogue, filters, drill-down, activity (Phase 2 E2E 10/10)                                              |
| 3     | Project dossier, milestones, computed health, portfolio (Phase 3 E2E 10/10; integration; E2E flow 24)                            |
| 4     | Skill intelligence, dossier, radar, heatmap, career graph, level models (Phase 4 E2E 14/14; integration; E2E flow 23)            |

**Intentional changes to earlier behaviour (additive):**

- Goals navigation is available; the `/goals` placeholder page is replaced by the real pages.
- The Command Center gained the Active goals KPI and goals-at-risk attention items.
- Milestones gained an optional goal link (set only from goals).
- Shared components gained opt-in options (`number` fields, `editFields`, picker `exclude`); wide
  list tables now scroll inside their container instead of widening the page.

## 38. Phase 6 Readiness

**READY WITH CONDITIONS**

Phase 6 can build on goals, targets, measurements and risk signals, the catalogue and
drill-down invariant, and the owner-scoped composite-FK and audit patterns.

**Conditions (none blocks starting Phase 6):**

1. **Specification decisions still open:** P5-4 (Tasks), P5-5 (Goal ↔ Evidence), P4-1 / P4-4 /
   P4-7, P3-1, and the Phase 3 scope baseline. AI experiments metrics in `05` will need explicit
   definitions, as goals did.
2. **Incomplete acceptance:** manual screen-reader audit, dependency audit and CI are PARTIAL
   (§32).
3. **Security:** no open application issues; add the `braces` override when a patch exists.
4. **Data portability:** extend the exchange format for milestones, level models and goals.
5. **Performance:** consider `ANALYZE` after large imports (§36 risk 3).

Phase 6 has **not** been started.
