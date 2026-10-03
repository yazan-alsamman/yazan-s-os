# PEOS — Phase 4 Skills & Career Intelligence Report

Date: 2026-10-03 · Repository: `Yazan_Personal_Engineering_OS_Spec` (dedicated repo, branch `main`, no remote)

## 1. Executive Summary

Phase 4 turns the Phase 1 skill registry into an evidence-grounded **Skills & Career
Intelligence** system. Nothing in it is self-assessed or estimated.

- **Every skill now has:**
  - an **evidence-derived level** (`skill-level-v1`): a cumulative, rule-by-rule ladder over linked
    evidence, projects and certifications, returned with every requirement and its found count;
  - **freshness** (`freshness-v1`) from real demonstration dates;
  - a **demonstration-activity trend** (`skill-trend-v1`);
  - **gap analysis** against its target, with an explicit definition of a **critical gap**
    (`gap-analysis-v1`).
- **Missing data stays visible.** "Not enough evidence", "No dated evidence", "Not computable",
  "Insufficient history" and "Not configured" replace zeros.
- **New views:**
  - a **skill dossier**;
  - a **skill intelligence page**: coverage and critical-gap KPIs, a **radar**, four
    distributions and a **gap heatmap** that is the source list for every metric;
  - a bounded **career graph** of real records and recorded relationships, with a list
    alternative;
  - **customisable level models**.
- **Command Center.** The Skill Coverage and Critical Skill Gaps KPIs are now real.
- **Bugs found during verification:** a dialog-focus defect in the shared Phase 1 dialogs, plus
  several UI and ordering issues. All were fixed.

**What is computed:** derived level, freshness, trend, gap, critical gap, coverage, the
distributions, the radar and the graph. All are computed on request and **never persisted**.

**What is persisted:**

- custom level-model names and descriptions;
- explicit Technology ↔ Skill links;
- a skill's level-model choice.

**What is unavailable:**

- learning velocity (no learning records exist);
- the production evidence ratio (no production flag on evidence);
- a level history (never reconstructed).

**Validation:**

- Unit 190/190 · integration 107/107 (authorization 40/40) · E2E 52/52 · axe 29/29.
- Build, typecheck, lint, formatting, Prisma, fresh migration and drift all **PASS**.
- The dependency audit is **PARTIAL**: one new high-severity advisory in lint-only tooling, with no
  patched release yet (§30).

**Phase 5 readiness:** **READY WITH CONDITIONS** (§37).

## 2. Scope Implemented

| Phase 4 scope (08 / prompt)          | Implemented                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Evidence-derived skill levels        | `skill-level-v1` (ADR 0027): pure functions over three grouped aggregates                                               |
| Level model and customisation        | `skill_level_models` table; names and descriptions of the canonical 0–5 scale (ADR 0026); level-models page             |
| Skill gap analysis and critical gaps | `gap-analysis-v1` (ADR 0029); source list `/api/v1/skills/intelligence`                                                 |
| Skill freshness                      | `freshness-v1`: 365 / 730 days (ADR 0028)                                                                               |
| Growth / trend                       | `skill-trend-v1`: demonstration activity, last 12 months vs the previous 12; per-year demonstration counts              |
| Skill radar                          | ECharts radar of derived levels, with targets, omitted-skill list and data table                                        |
| Skill-gap heatmap                    | Semantic table: level, target, gap, freshness, production evidence, evidence, trend; URL filters and sort; mobile cards |
| Career graph                         | Bounded graph over the 8 real join tables plus the new Technology ↔ Skill link (ADR 0030); list alternative             |
| Career analytics                     | Coverage, critical gaps, targets without evidence, production evidence, freshness, level, gap and trend distributions   |
| Metric catalogue and drill-downs     | 60 metrics (49 available); every available metric has a drill-down mapping                                              |
| Command Center integration           | Skill Coverage and Critical Skill Gaps KPIs; skill category filter applies                                              |
| Tests, docs, ADRs                    | +24 unit, +18 integration, +14 E2E, +6 axe; ADRs 0026–0030; docs (§32)                                                  |

## 3. Explicitly Not Implemented

| Item                                                                             | Reason                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------ |
| Goals, goal hierarchy, Goal ↔ Skill / Project                                    | Phase 5                                          |
| LearningItem / Knowledge Base, learning metrics, learning plans                  | Not scheduled in 08 (gap C4); metric unavailable |
| AI Copilot, recommendations, AI Lab                                              | Phases 6 and 8; AI is excluded from Phase 4      |
| Architecture intelligence, ADR registry                                          | Phase 7                                          |
| Integrations (GitHub, CI/CD, issue trackers), DORA                               | Phase 9                                          |
| Opportunities, portfolio export, CV/website ingestion, semantic search, pgvector | Later phases                                     |
| Skill-decay notifications                                                        | Out of scope                                     |
| Persisted level history, interpolated progression                                | Would fabricate history (ADR 0028)               |
| Custom level models in JSON/CSV export and import                                | Deferred to an exchange-format extension (§34)   |

## 4. Repository / Commit Information

The checks before each commit were `pwd`, `git status`, `git branch` and `git remote -v`. They
confirmed:

- the root is `C:/Users/Lenovo/Desktop/yazan/Yazan_Personal_Engineering_OS_Spec`;
- the branch is `main`;
- there is no remote.

Files were staged by explicit path; `git add -A` was never used. **Nothing was pushed.** The
home-folder repository was not modified.

| Commit    | Content                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| `01afe83` | Skill level models, technology links and schema                                 |
| `4cb3632` | Evidence-derived skill intelligence, analytics and career graph                 |
| `fc82011` | Skill dossier, intelligence views, career graph UI and E2E                      |
| _(final)_ | ADRs 0026–0030, documentation and this report (the commit containing this file) |

## 5. Existing Skill Model

This is the model as inspected before any change.

| Element                | State before Phase 4                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Skill.levelModel`     | String id. Registry with only `peos-default-v1` (labels only).                                                         |
| `Skill.targetLevel`    | Nullable int. DB CHECK 0–10; validated against the model (0–5).                                                        |
| Current level          | **Not stored** (ADR 0013, deliberately).                                                                               |
| `SkillEvidence`        | `strength` (weak/moderate/strong), `date` (optional), composite FKs.                                                   |
| `Evidence`             | `type` (10 values incl. `production_metric`, `testimonial`, `publication`), `date`, `verified`/`verifiedAt`, `origin`. |
| `ProjectSkill`         | Plain join; meaning comes from `Project.status` and `completedAt`.                                                     |
| `CertificationSkill`   | Plain join; meaning comes from `Certification.status` (planned / in_progress / earned / revoked).                      |
| Technology ↔ Skill     | **Did not exist** (deferred by ADR 0017).                                                                              |
| Experience ↔ Skill     | **Does not exist**. Experiences connect only through `ExperienceEvidence`.                                             |
| Provenance / ownership | `origin` + `importRecordId`; every join has `user_id` with composite FKs (ADR 0011).                                   |

**Spec vs repository:**

- **Spec 04 `SkillEvidence`** has an `id`; the repository uses the composite PK
  `(skill_id, evidence_id)`. This is equivalent and was left unchanged.
- **Spec 01 skill fields "Last used" and "Learning path"** do not exist. "Last demonstrated" is
  computed (freshness). The learning path depends on LearningItem, which doesn't exist (P4-7).

## 6. New Skill Intelligence Model

| Concept                | Computed / persisted        | Location                                             |
| ---------------------- | --------------------------- | ---------------------------------------------------- |
| Evidence-derived level | Computed                    | `skill-intelligence.ts` → `deriveLevel`              |
| Freshness              | Computed                    | `freshness`                                          |
| Demonstration trend    | Computed                    | `trend`                                              |
| Gap / critical gap     | Computed                    | `gapAnalysis`                                        |
| Signals (aggregates)   | Computed (3 SQL aggregates) | `skill-intelligence.service.ts` → `loadSignals`      |
| Custom level model     | **Persisted**               | `skill_level_models`                                 |
| Skill's model choice   | **Persisted**               | `skills.level_model` (`"custom"`) + `level_model_id` |
| Technology ↔ Skill     | **Persisted**               | `technology_skills`                                  |

No derived value is cached. The benchmarks (§28) show caching is not needed.

## 7. Evidence-Derivation Algorithm

`skill-level-v1` (ADR 0027) gives the highest level whose rule **and every lower rule** hold.

| Level | Mode | Requirements                                                                                                                                          |
| ----- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | any  | ≥ 1 evidence link · ≥ 1 project link · ≥ 1 certification earned or in progress                                                                        |
| 2     | any  | ≥ 1 moderate/strong evidence · ≥ 1 linked project in delivery (development/validation/production/maintenance or completed) · ≥ 1 earned certification |
| 3     | all  | ≥ 2 moderate/strong evidence · ≥ 1 of them verified · ≥ 1 linked project in delivery                                                                  |
| 4     | all  | ≥ 3 moderate/strong · ≥ 2 verified · ≥ 1 strong · ≥ 1 production-linked record                                                                        |
| 5     | all  | ≥ 5 moderate/strong · ≥ 3 verified · ≥ 2 strong and verified · ≥ 2 production-linked · ≥ 1 verified testimonial or publication                        |

- **Production-linked** = linked projects in production or maintenance, plus moderate/strong
  `production_metric` evidence.
- **Output:**
  - `state`: derived / insufficient_evidence / no_evidence;
  - `level` (1–5 or null);
  - every rule with requirement, required count, found count and met flag;
  - `nextLevel.missing`;
  - a one-sentence explanation.

| Decision                      | Reason                                                          | Spec ref                  | Implementation              | Tests                                          |
| ----------------------------- | --------------------------------------------------------------- | ------------------------- | --------------------------- | ---------------------------------------------- |
| Cumulative ladder             | Prevents skipping applied work; explainable                     | 00 §2.1; 08 Phase 4       | `levelRules`, `deriveLevel` | unit: each level boundary, cumulative case     |
| Association alone caps at 2   | A project or certification link is not proof of expertise       | Prompt §6                 | rules 2–3                   | unit: certification-only → 2, project-only → 2 |
| Level 5 needs recognition     | No leadership record exists; testimonials/publications are real | 01 §6 "Expert / can lead" | rule 5                      | unit: level 5 with and without recognition     |
| No evidence → `null`, never 0 | Missing ≠ zero proficiency                                      | Prompt §28                | `deriveLevel`               | unit + integration + E2E                       |
| Computed on read              | Single source of truth; cache unnecessary                       | Prompt §4                 | service                     | benchmark §28                                  |

## 8. Evidence Strength Semantics

| Signal               | Source field                                                   | Counts as                       |
| -------------------- | -------------------------------------------------------------- | ------------------------------- |
| Evidence link        | `SkillEvidence` row                                            | 1 record (any strength)         |
| Qualifying evidence  | `strength IN (moderate, strong)`                               | Applied demonstration           |
| Verified             | `Evidence.verified`                                            | Independently checked record    |
| Strong               | `strength = strong`                                            | Strong demonstration            |
| Production metric    | qualifying + `Evidence.type = production_metric`               | Production-linked               |
| Recognition          | verified + `type IN (testimonial, publication)`                | Signal for "can lead"           |
| Delivered project    | `Project.status IN (development…maintenance)` or `completedAt` | Applied project work            |
| Production project   | `Project.status IN (production, maintenance)`                  | Production-linked               |
| Earned certification | `Certification.status = earned`                                | Learning credential (caps at 2) |

**Assumptions** (in the catalogue, the ADR and the dossier copy):

- `strength` is the user's statement about the link, and only counts together with real records.
- Expired certifications count as earned.
- Evidence linked only to a project, but not to the skill, does not count for the skill.

No project outcome, production status of evidence, certification strength or evidence quality is
invented.

## 9. Skill Level Model

- **Default:** `peos-default-v1`, the `01` §6 labels, with descriptions that **state the evidence
  rule** for each level.
- **Custom models** (ADR 0026):
  - per-user name (unique, 1–80 characters);
  - exactly six levels with values 0–5 in order, each with a label (1–60 characters) and an
    optional description (≤ 300).
  - Validation: Zod plus the DB CHECK `jsonb_array_length = 6`.
  - Limit: 20 per user.
- **Ownership:** a composite FK from `skills (level_model_id, user_id)`, plus CHECK
  `skills_level_model_chk` (`custom` ⇔ `level_model_id`).
- **Deletion while used:** refused with 409.
- **Rules unchanged:** custom names never change the evidence rules.
- **Special values:**
  - Level 0 never participates; it is never derived.
  - Target 0 is treated as "no target".
  - The maximum level is 5. A higher value means more demonstrated capability.
  - No normalisation is needed, because the values are shared.

**Tests:** unit tests for model validation (count, order, blank labels, wrong values), default
descriptions and `isValidLevel`; integration tests for custom labels, the 409 rule, foreign-model
rejection (service and DB) and audit.

## 10. Gap Analysis

| State            | Condition                                     | Display                                    |
| ---------------- | --------------------------------------------- | ------------------------------------------ |
| `below_target`   | target ≥ 1, level derived, target − level > 0 | "_n_ below"                                |
| `at_target`      | difference = 0                                | "At target"                                |
| `above_target`   | difference < 0                                | "_n_ above"                                |
| `not_computable` | target ≥ 1, no derived level                  | "Not computable" (target without evidence) |
| `no_target`      | target null or 0                              | "No target" / "Not configured"             |

The heatmap and dossier show, for each skill:

- the evidence-derived level and target;
- the gap and freshness;
- evidence count (with undated count) and latest demonstration;
- production-linked count;
- supporting projects, explicit and via-project technologies, and certifications (dossier).

No missing evidence is turned into a gap value.

## 11. Critical Gap Semantics

**Definition (`gap-analysis-v1`, ADR 0029):** an **active** skill with a target ≥ 1 and a derived
level where either:

- the target is **at least 2 levels** above the level, or
- the level is **below target and freshness is stale**.

The UI answers the questions the prompt requires:

- **Why it's a gap, and the target:** the gap explanation.
- **What evidence supports the current level:** the rule table and the supporting evidence list.
- **What evidence is missing:** "To reach level _n_: …".
- **When it was last demonstrated:** the freshness fact.

Skills without evidence are **never** critical; they are counted as `skills.targets_without_evidence`.

**Tests:** unit tests for each condition and the inactive exclusion; integration tests for
critical = list total (`critical=true`); E2E for the KPI drill-down to the exact list.

## 12. Freshness Model

`freshness-v1` (ADR 0028):

- **Demonstration date** = `COALESCE(SkillEvidence.date, Evidence.date)`, only dates on or before
  today (UTC).
- **States:**
  - fresh ≤ 365 days
  - aging 366–730 days
  - stale > 730 days
  - no dated evidence
  - no evidence
- **Undated evidence** counts as evidence but never establishes recency.
- **Future-dated evidence** is ignored and reported.
- **Never used:** `updatedAt`, import time, audit time, page time.
- **Visibility:** thresholds appear in every explanation and in the catalogue.

**Tests:** boundaries at 0, 365, 366, 730 and 731 days; UTC midnight; same day regardless of
hour; undated; future; no evidence. Integration: the link date wins over the evidence date.

## 13. Growth / Trend Model

`skill-trend-v1` (ADR 0028) compares dated demonstrations in the last 365 days (A) with the 365
before (B):

- A > B: **increasing** ("More demonstrations")
- A = B: **stable**
- A < B: **decreasing**

**Insufficient history** when any of these holds:

- fewer than 2 dated demonstrations;
- none older than window A;
- none at all in A or B (sparse history is never interpolated).

It is labelled as **activity, not proficiency**. The dossier adds real per-year demonstration
counts for 6 years. **No level history is reconstructed.**

## 14. Skill Dossier

`/skills/:id`. The header and About panel are kept from Phase 1, with provenance.

| Section                  | Content                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill intelligence       | Derived level, target, gap (critical badge), freshness (latest date), trend; four explanation sentences; model versions; level-model selector |
| How the level is derived | Table of the 5 rules × requirements: needed, found, met; plus "To reach level _n_"                                                            |
| Supporting evidence      | Newest demonstration first (≤ 100, "View all" → `/evidence?skillId=`); type, strength, verified, provenance; Manage; per-year table           |
| Projects                 | Linked projects with lifecycle status                                                                                                         |
| Technologies             | Explicit links (Manage technologies) **and**, separately labelled, technologies used in this skill's projects                                 |
| Certifications           | Linked certifications with status; states that they cap the level at 2                                                                        |
| Experiences              | Experiences whose linked evidence demonstrates the skill                                                                                      |
| Career graph link        | Focused graph for the skill                                                                                                                   |

**Fix made here:** the Phase 1 evidence picker dropped link demonstration dates when saving. It
now preserves them, which freshness depends on.

## 15. Skill Radar

- **Plotted:** up to 12 active skills **with a derived level**, target skills first, then by level
  and name.
- **Target series:** drawn only when every plotted skill has a target, so a missing target is
  never drawn.
- **Missing data:** skills without a derived level are **named and not plotted**, never drawn
  as 0.
- **Accessibility:**
  - an accessible name listing every value;
  - a data table (skill, level, target) with dossier links;
  - CSV download;
  - definition drawer and empty/insufficient states;
  - fewer than 3 skills falls back to the table.
- **Mobile:** radius and label width are reduced.

## 16. Skill Gap Heatmap

- **Rows:** skills.
- **Columns** (`05` dimensions that exist):
  - derived level
  - target
  - gap (+ Critical)
  - freshness (+ days)
  - production evidence
  - evidence (+ undated)
  - trend
- **Encoding:** a semantic `<table>` with caption and scoped headers, so every cell carries text.
  Colour reinforces gap and freshness only; levels are uncoloured.
- **Filters:** gap, freshness, derived level, trend, critical, has target, production evidence,
  active. **Sort:** gap, freshness, level, evidence, name. Both live in the URL and persist through
  reload (E2E). Pagination is 25 per page.
- **States:** loading, error, empty and "no match".
- **Mobile:** a card list below 768 px.

## 17. Career Graph

- **Nodes:** skills, projects, technologies, certifications, experiences and evidence.
- **Edges:** rows of `project_skills`, `technology_usages`, `project_evidence`, `skill_evidence`,
  `technology_skills`, `certification_skills`, `certification_evidence` and `experience_evidence`
  only.
- **Modes:**
  - overview: the top 20 most-connected active skills plus neighbours, with category filter;
  - focus: a record plus neighbours; a foreign or missing focus returns 404.
- **Bounds:** limit 40/80/150 nodes; neighbour queries capped at 2,000 rows; a fixed query count;
  deterministic ordering.
- **Rendering:** ECharts force layout. Type is shown by **shape** and colour, the legend scrolls,
  selecting a node opens the record, and edge clicks are ignored.
- **List alternative:** each record's type, connection count and connected names, with Open and
  "Focus the graph on …" actions.
- **Integration test:** every edge has both endpoints in the node set; the edge count equals the
  sum of the source join rows; responses are deterministic; the node limit holds.

## 18. Career Analytics

| Metric                     | Implemented | Note                                                 |
| -------------------------- | ----------- | ---------------------------------------------------- |
| Skill growth               | Yes         | `skills.growth`: demonstration-activity distribution |
| Skill coverage             | Yes         | Fresh target skills ÷ target skills (active)         |
| Skill gaps / critical gaps | Yes         | `skills.gap_distribution`, `skills.critical_gaps`    |
| Skill freshness            | Yes         | `skills.freshness`                                   |
| Evidence production        | Existing    | Phase 2 evidence velocity / evidence over time       |
| Learning velocity          | **No**      | Unavailable: no LearningItem data (P4-7)             |
| Career graph               | Yes         | §17                                                  |

## 19. Command Center Integration

- **KPI strip:** "Skill coverage" (shown as a percentage, with "_n_ of _m_ target skills
  demonstrated in the last 365 days") and "Critical skill gaps" were added. Both come from the
  same analytics service as the skill intelligence page, honour the Command Center skill-category
  filter, and drill to `/skills/intelligence?active=true&…`.
- **"Cannot be computed yet" note:** now lists Goals, AI experiments, architecture decisions and
  technical debt.
- **Skill snapshot text:** now points to Skills → Intelligence.
- **Nothing else changed.**
- **Tests:** an integration test checks the Command Center values equal the analytics summary;
  E2E checks the values and drill-down.

## 20. Metric Catalogue Changes

**52 → 60 metrics** (39 → 49 available). There is still a single catalogue.

| Change                 | Keys                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Now available (v2)     | `skills.coverage` (ratio), `skills.critical_gaps`, `skills.freshness` (distribution)                                                                                                             |
| Added, available (7)   | `skills.current_level` (score), `skills.level_distribution`, `skills.gap_distribution`, `skills.targets_without_evidence`, `skills.growth`, `skills.production_evidence`, `skills.radar` (score) |
| Added, unavailable (1) | `skills.learning_velocity`: no LearningItem data; spec decision required                                                                                                                         |
| Unchanged and guarded  | `projects.delivery_rate`: completed ÷ (completed + overdue), v2 (§19 of the prompt; regression test)                                                                                             |

- **Fields:** every new metric has all 16 fields; this is unit-enforced.
- **Drill-down:** every available metric has a mapping (unit test). Score-style exceptions
  (`skills.current_level`, `skills.radar`) drill to the skill dossier, as documented.
- **Delivery-rate regression guard:** a unit test pins the catalogue formula prefix, the version
  and `deliveryRate` behaviour. Docs, ADR 0024 and the implementation are consistent; no
  inconsistency was found.

## 21. API Surface

All endpoints require authentication and are owner-scoped. Identity comes from the session; Zod
validates input; the standard error envelope applies; foreign or missing ids return 404.

| Method               | Path                              | Rate limit         | Purpose                                 |
| -------------------- | --------------------------------- | ------------------ | --------------------------------------- |
| GET                  | `/api/v1/skills/intelligence`     | analytics          | Source list (filters, sort, page ≤ 100) |
| GET                  | `/api/v1/skills/:id/intelligence` | analytics          | Dossier analysis                        |
| PUT                  | `/api/v1/skills/:id/technologies` | mutation           | Replace explicit technology links       |
| GET · POST           | `/api/v1/skill-level-models`      | default · mutation | Default and custom models · create      |
| GET · PATCH · DELETE | `/api/v1/skill-level-models/:id`  | default · mutation | Read · update · delete (409 while used) |
| GET                  | `/api/v1/analytics/skills`        | analytics          | Career analytics and radar              |
| GET                  | `/api/v1/analytics/career-graph`  | analytics          | Bounded career graph                    |

**Extended:**

- `PATCH`/`POST /api/v1/skills` accept `levelModelId`.
- `GET /api/v1/evidence` accepts `skillId`.

**Route conventions:** the prompt's examples (`/analytics/skills/radar`, `/gaps`, `/freshness`)
are consolidated into `/analytics/skills`, with the source list at `/skills/intelligence`. This
avoids duplicate APIs, and every value comes from one computation.

## 22. Database Changes

Migration `20261002231734_skills_career_intelligence` is additive.

| Change                                                      | Why required                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Table `skill_level_models`                                  | 01 §6 / 10 "configurable level model" (ADR 0013 deferral)            |
| Column `skills.level_model_id` + index                      | Link a skill to its owner's custom model                             |
| FK `(level_model_id, user_id)` NO ACTION                    | DB-level ownership; allows account deletion to cascade               |
| CHECK `skills_level_model_chk`                              | `level_model` ∈ {default, custom}, and `custom` ⇔ id set             |
| CHECK `skill_level_models_name_chk` / `_levels_chk`         | Non-blank name ≤ 80; exactly six levels                              |
| Table `technology_skills` + `skill_id` index, composite FKs | 00 §5 / 01 §6 related technologies; career graph (ADR 0017 deferral) |

- **Constraints on existing data:** none, beyond the new CHECK, which every existing row
  satisfies (all used the default model).
- **No speculative tables:** no Goal, AI, Architecture, Opportunity or Learning tables.

## 23. Migrations

- The migration was created with `prisma migrate dev --create-only`, with the CHECKs added by
  hand. The FK action was changed from RESTRICT to NO ACTION before the first apply, so that
  account deletion keeps cascading.
- Applied to `peos` and `peos_test`.
- **Migration-from-zero:**
  1. Created a fresh DB.
  2. Applied **4 migrations**.
  3. Drift check: "No difference detected" (exit 0).
  4. All 6 new constraints present.
  5. Integration suite on the fresh DB: **107/107**.
  6. Dropped the DB.

The migration is deterministic and non-destructive, and does not depend on any seed data.

## 24. Authorization / User Isolation

`tests/integration/skill-intelligence-authz.int.test.ts` runs 7 HTTP tests with two real
sessions:

| Attack (Bob → Alice)                                                         | Result                   |
| ---------------------------------------------------------------------------- | ------------------------ |
| No session on the 6 Phase 4 GET surfaces                                     | 401                      |
| Read Alice's skill intelligence, skill or level model                        | 404, no "Alice" in body  |
| Rename or delete Alice's level model; replace her skill's technology links   | 404; unchanged           |
| Assign Alice's level model to his skill; link Alice's technology             | 400; nothing stored      |
| Lists, analytics, career graph and models with injected `userId` / `ownerId` | Only Bob's data          |
| Focus the career graph on Alice's skill, technology or evidence              | 404                      |
| Invalid filters, types, limits, focus pairs, malformed level model           | 400 VALIDATION_FAILED    |
| Malformed path id                                                            | 404 (Phase 1 convention) |

**Database level** (integration tests): the composite FKs reject a cross-owner technology link
and a cross-owner level model, and the CHECK rejects an inconsistent model marker.

**E2E:** a second real account gets "Not found" on the dossier, 404 from the APIs, and none of the
owner's skills.

**Total authorization tests: 40/40** (idor 13, ownership 5, analytics-authz 6, project-authz 9,
skill-authz 7).

## 25. Audit Logging

| Mutation                               | Audit action                                           |
| -------------------------------------- | ------------------------------------------------------ |
| Create, update or delete a level model | `skill_level_model.created` / `.updated` / `.deleted`  |
| Skill target or level-model change     | `skill.updated` (domain snapshot incl. `levelModelId`) |
| Skill technology links                 | `skill.relations_updated` (`technologyIds` only)       |
| Skill evidence links (Phase 1)         | `skill.relations_updated`                              |

- All are written in the same transaction, with domain-only snapshots.
- Computed analytics are not audited; they are read-time signals.
- The activity feed shows level-model events with safe labels (`name`).
- An integration test asserts the audit sequence and payload.

## 26. UX / UI

- **New pages:** `/skills/intelligence`, `/skills/graph` and `/skills/level-models`, plus a
  restructured `/skills/:id` dossier. Skills section tabs: Skills · Intelligence · Career graph ·
  Technologies · Level models.
- **States:**
  - loading (skeletons);
  - error (retry);
  - empty: a first-run panel and "No skills match";
  - partial data: "Not enough evidence", "No dated evidence", "Not computable", "Insufficient
    history", "Not configured", radar omissions.
- **Responsive:** checked at 375 px, md and 1440 px. There is no page overflow on the
  intelligence page, dossier or graph (E2E). The heatmap becomes cards, wide tables scroll inside
  labelled, focusable regions, and the radar is resized.
- **Light and dark:** chart tokens are reused; the dark intelligence page passes axe.
- **Defects found and fixed during verification:**
  - **Dialog focus (pre-existing).** `RelationPicker` and `ConfirmDelete` did not return focus to
    their opener. All dialogs now share `useReturnFocus`.
  - **Lost demonstration dates (pre-existing).** The Phase 1 evidence picker dropped link
    demonstration dates on save.
  - **Evidence ordering.** Dossier evidence was not ordered by demonstration date.
  - **Radar.** A misleading target series for skills without a target, and clipped mobile labels.
  - **Graph.** Legend overlap, and edge clicks navigated to the wrong record.
  - **Heatmap.** Derived-level cells were coloured as if levels were good or bad.
  - **Trend.** Sparse history (nothing in 24 months) was labelled "stable"; this was caught by
    unit tests.

## 27. Accessibility

| Item                                  | Status                                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated axe (WCAG 2.0/2.1/2.2 A/AA) | **29 scans, 0 violations.** Phase 4 adds 6: dossier, intelligence (light), graph, level models, dark intelligence, mobile intelligence                                                                    |
| Keyboard (E2E)                        | Definition drawer opens with Enter, closes with Escape, focus returns. "Manage evidence" dialog returns focus. The heatmap filter changes by keyboard. Graph "Focus" buttons and Open links are focusable |
| Data tables                           | Radar table, distribution tables, heatmap table, rule table, per-year table, graph record list                                                                                                            |
| Chart alternatives                    | Accessible names listing values, plus tables. Type is shown by shape in the graph. No colour-only meaning                                                                                                 |
| Manual screen-reader audit            | **NOT DONE**: still outstanding since Phase 2                                                                                                                                                             |
| WCAG 2.2 AA overall                   | **PARTIAL**: automated and keyboard checks only                                                                                                                                                           |

## 28. Performance

**Dataset** (one user):

- 1,000 projects
- 150 skills
- 500 technologies
- 12,000 evidence items and 12,000 skill–evidence links
- 3,000 project–skill links
- 5,000 technology usages
- 1,000 technology–skill links
- 200 certifications (400 links)
- 50,000 audit rows

**Method:**

- PostgreSQL 17.10 (Docker, local); service-layer calls.
- 1 warm-up (excluded) + 10 timed runs; median = mean of the 5th and 6th runs.
- A temporary test file, removed afterwards.
- **Four runs.** Runs c and d were added to explain the anomaly seen in run b.

| Call (median / max ms)                 | Run a       | Run c (`ANALYZE`) | Run b (no `ANALYZE`) | Run d (no `ANALYZE`) |
| -------------------------------------- | ----------- | ----------------- | -------------------- | -------------------- |
| Skill list (Phase 1)                   | 10.5 / 20.3 | 11.0 / 23.4       | 252.8 / 318.5        | 277.4 / 328.0        |
| Skill detail (Phase 1)                 | 18.7 / 25.5 | 18.0 / 26.4       | 174.5 / 186.3        | 173.0 / 205.8        |
| Skill intelligence (dossier)           | 24.9 / 30.4 | 28.4 / 43.3       | 203.1 / 273.9        | 215.6 / 275.4        |
| Gap analysis list / heatmap            | 28.3 / 37.5 | 28.8 / 30.2       | 32.6 / 36.7          | 54.6 / 58.2          |
| Freshness filter                       | 26.8 / 32.2 | 27.4 / 29.6       | 28.3 / 33.1          | 51.9 / 55.6          |
| Career analytics + radar               | 28.9 / 36.7 | 28.9 / 30.7       | 28.8 / 32.4          | 53.5 / 83.4          |
| Career graph overview (80)             | 27.3 / 39.4 | 26.4 / 29.3       | 26.4 / 30.8          | 304.5 / 387.8        |
| Career graph overview (150, all types) | 35.2 / 37.9 | 37.4 / 46.0       | 38.1 / 43.8          | 301.3 / 322.8        |
| Career graph focus                     | 16.4 / 22.7 | 18.3 / 28.8       | 15.6 / 19.3          | 21.3 / 22.0          |
| Command Center dashboard               | 66.5 / 81.7 | 67.3 / 87.7       | 57.1 / 69.5          | 447.1 / 536.5        |

**Outlier analysis (verified, not assumed):**

- Runs b and d were up to 10× slower on several queries.
- The benchmark truncates and bulk-loads tables, so the planner can run with stale statistics
  until autovacuum analyses them.
- Run c, with an explicit `ANALYZE` after loading, reproduces run a's numbers.
- In real use, rows arrive incrementally and autovacuum keeps statistics current. This is a
  benchmark artefact, but it is documented as a risk (§35).

**Query strategy:**

- Three grouped aggregates for all skill signals.
- Shared rows and predicate for the metrics.
- A fixed query count for the graph, bounded by node and row caps.
- Parallel independent queries.
- **No caching.**
- **New indexes:** only `technology_skills(skill_id)` and `skills(level_model_id)`. The existing
  join indexes cover the aggregates.

## 29. Testing

| Suite                   | Result       | Phase 4 additions                                                                                           |
| ----------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| Unit                    | **190/190**  | +24: `skill-intelligence.test.ts`. Plus `drilldown.test.ts` sample buckets and the catalogue counts (60/49) |
| Integration             | **107/107**  | +18: `skill-intelligence.int.test.ts` 11, `skill-intelligence-authz.int.test.ts` 7                          |
| Authorization (subset)  | **40/40**    | +7                                                                                                          |
| E2E                     | **52/52**    | +14: `phase4.spec.ts`                                                                                       |
| Accessibility scans     | **29/29**    | +6, 0 violations                                                                                            |
| Regression (Phases 0–3) | **All pass** | Unit 166, integration 89, E2E 38 within the totals                                                          |

**Unit coverage:**

- **Skill level:** each level boundary, caps, cumulative ladder, determinism, explanation.
- **Level models:** count, order, blank labels, values; `isValidLevel`.
- **Freshness:** same day, 365/366/730/731, UTC midnight, undated, future, none.
- **Trend:** insufficient (<2, no old history, sparse), increasing, stable, decreasing.
- **Gap:** below, at and above target; no target; target 0; not computable; critical rules;
  inactive skills.
- **Source list:** predicate and sort.
- **Phase 3 regression guard:** delivery-rate semantics.

**Integration coverage:**

- the derived level from real records, every input explained;
- the link date overriding the evidence date; future and undated handling;
- insufficient evidence (planned certification only); certification cap; stale critical gap;
- **every metric and bucket equal to its list total**; radar omissions;
- category filter consistency; Command Center equality;
- empty-account no-data states;
- pagination and sorting;
- custom models (labels, 409, foreign model rejected at the service and DB layers, audit);
- technology links (ownership at the service and DB layers, audit);
- the career graph (only real edges, edge count = join rows, deterministic, focus, limits, 404,
  invalid types).

**E2E coverage of the 24 required flows:**

| #   | Flow                           | Test                                                                     |
| --- | ------------------------------ | ------------------------------------------------------------------------ |
| 1   | Skills page works              | "the Skills page still works…"                                           |
| 2   | Create/edit target             | same                                                                     |
| 3   | Linked evidence appears        | dossier test (3 items, newest first)                                     |
| 4   | Derived level appears          | dossier test ("4 — Advanced")                                            |
| 5   | Explanation shows evidence     | dossier test (rule table, evidence list)                                 |
| 6   | Gap calculated                 | heatmap "1 below / Critical"; dossier "At target"                        |
| 7   | Missing evidence explicit      | "missing evidence and stale freshness…"; new skill "Not enough evidence" |
| 8   | Freshness from evidence dates  | same (Stale, last demonstrated, days)                                    |
| 9   | Radar real skills              | "radar, distributions and heatmap…"                                      |
| 10  | Radar table                    | same (Show data table → skill link)                                      |
| 11  | Heatmap real data              | same                                                                     |
| 12  | Heatmap table works            | same + filters test                                                      |
| 13  | Dossier projects               | dossier test ("Projects (1)")                                            |
| 14  | Dossier technologies           | "explicit technology links…"                                             |
| 15  | Dossier certifications         | same ("Certifications (1)", cap note)                                    |
| 16  | Career graph relationships     | "the career graph…"                                                      |
| 17  | Graph node drill-down          | same (Focus → URL; record link → dossier)                                |
| 18  | Filters persist via URL/reload | "heatmap filters persist…"                                               |
| 19  | Mobile                         | "intelligence, dossier and graph fit a phone"                            |
| 20  | Dark theme                     | "dark theme…"                                                            |
| 21  | Keyboard                       | "keyboard: filters, definitions and dialogs…"                            |
| 22  | Cross-user blocked             | "cross-user access to skill intelligence is blocked"                     |
| 23  | Command Center uses Phase 4    | "Command Center skill KPIs…"                                             |
| 24  | Phase 3 unchanged              | same (project dossier health) + `phase3.spec.ts` 10/10                   |

**Test changes outside Phase 4 files:**

- **`phase2.spec.ts`:** the metric catalogue page check now expects "Unavailable — Phase 5"
  instead of "Phase 4", because Phase 4 made those metrics available. It still verifies that
  unavailable metrics are shown.
- **`analytics.test.ts`:** catalogue counts updated to 60/49; the unavailable-metric test now uses
  `skills.learning_velocity`.
- **`drilldown.test.ts`:** sample buckets updated.

No assertion was weakened.

## 30. Validation

```
Unit:                 190/190
Integration:          107/107
Authorization:        40/40
E2E:                  52/52
Accessibility scans:  29/29 (0 violations)
Build:                PASS
Typecheck:            PASS
Lint:                 PASS (0 warnings)
Formatting:           PASS
Prisma format:        PASS
Prisma validation:    PASS
Prisma generate:      PASS
Fresh migration:      PASS (4 migrations; integration 107/107 on the fresh DB)
Migration drift:      PASS (exit 0)
Dependency audit:     PARTIAL — 1 high: braces <=3.0.3 (GHSA-vfj7-8cjw-p6xm) via eslint-config-next
                      (lint-only dev dependency, not shipped, no user input). No patched release exists
                      (latest 3.0.3), so no override is possible yet. The advisory appeared after Phase 3.
CI:                   NOT RUN — no remote or CI (not configured, by instruction)
Manual screen-reader: NOT RUN — requires a human with NVDA/VoiceOver
```

## 31. Acceptance Criteria

| Area          | Criterion                              | Status  | Evidence                                                                                 |
| ------------- | -------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| Skills        | Skill level model                      | PASS    | Default + custom models (ADR 0026); unit, integration, E2E                               |
| Skills        | Evidence-derived current level         | PASS    | skill-level-v1 (§7)                                                                      |
| Skills        | Target level                           | PASS    | Create/edit E2E; validation                                                              |
| Skills        | Skill gap analysis                     | PASS    | §10                                                                                      |
| Skills        | Critical gaps                          | PASS    | §11; KPI = list                                                                          |
| Skills        | Freshness                              | PASS    | §12; boundary tests                                                                      |
| Skills        | Growth / trend                         | PARTIAL | Demonstration-activity trend only; level history cannot be derived from the data (P4-5)  |
| Skills        | Skill dossier                          | PASS    | §14                                                                                      |
| Skills        | Evidence traceability                  | PASS    | Rule table with counts; every evidence item listed with source fields                    |
| Skills        | Skill/project relationships            | PASS    | Dossier, graph, derivation                                                               |
| Skills        | Skill/technology relationships         | PASS    | New explicit link (ADR 0030) + via-project path                                          |
| Skills        | Skill/certification relationships      | PASS    | Dossier, graph, derivation cap                                                           |
| Skills        | Career graph                           | PASS    | §17                                                                                      |
| Skills        | Radar                                  | PASS    | §15                                                                                      |
| Skills        | Heatmap                                | PASS    | §16. The production-evidence column uses production projects + production metrics (P4-8) |
| Analytics     | Metric Catalogue                       | PASS    | 60 metrics; governance tests                                                             |
| Analytics     | Definitions / formulas                 | PASS    | Catalogue + definition drawers                                                           |
| Analytics     | Source visibility                      | PASS    | Meta lines, heatmap source line, rule table                                              |
| Analytics     | Drill-down                             | PASS    | Mapping for every available metric; equality tests                                       |
| Analytics     | Empty states                           | PASS    | Integration + E2E                                                                        |
| Analytics     | Temporal semantics                     | PASS    | Point-in-time, stated per metric; UTC day                                                |
| Analytics     | Data freshness                         | PASS    | "Evaluated <date> (UTC)" on every view                                                   |
| Security      | Authentication                         | PASS    | 401 tests                                                                                |
| Security      | Authorization / IDOR / ownership       | PASS    | 40 authorization tests + DB FKs                                                          |
| Security      | Validation                             | PASS    | Zod + DB checks; 400 tests                                                               |
| UX            | Responsive                             | PASS    | 375 px E2E (no overflow); mobile cards                                                   |
| UX            | Light/dark                             | PASS    | Dark axe                                                                                 |
| UX            | Loading / empty / error / partial data | PASS    | §26                                                                                      |
| Accessibility | Automated axe                          | PASS    | 29/29                                                                                    |
| Accessibility | Keyboard                               | PASS    | Keyboard E2E; focus-return fix                                                           |
| Accessibility | Data tables / chart alternatives       | PASS    | §27                                                                                      |
| Accessibility | Manual screen reader                   | PARTIAL | Not performed                                                                            |
| Engineering   | Migrations                             | PASS    | §23                                                                                      |
| Engineering   | Build / typecheck / lint / formatting  | PASS    | §30                                                                                      |
| Engineering   | Dependency audit                       | PARTIAL | 1 high in lint tooling, no fix available                                                 |
| Engineering   | Performance                            | PASS    | §28 (outliers explained)                                                                 |
| Engineering   | Documentation                          | PASS    | §32                                                                                      |
| Engineering   | Regression                             | PASS    | §36                                                                                      |
| Global        | CI                                     | PARTIAL | No remote                                                                                |

## 32. ADRs

| ADR  | Title                                                                   | Status   |
| ---- | ----------------------------------------------------------------------- | -------- |
| 0026 | Customisable skill level models                                         | Accepted |
| 0027 | Evidence-derived skill level (skill-level-v1)                           | Accepted |
| 0028 | Skill freshness (freshness-v1) and demonstration trend (skill-trend-v1) | Accepted |
| 0029 | Skill gap analysis and critical gaps (gap-analysis-v1)                  | Accepted |
| 0030 | Career graph and the explicit Technology ↔ Skill relationship           | Accepted |

**Updated docs:**

- `docs/architecture/domain-model.md`
- `api.md`
- `analytics.md` (incl. Phase 4 performance)
- `metric-catalogue.md` (regenerated from code)
- `security-baseline.md`
- `docs/DEVELOPMENT.md`
- `docs/SPECIFICATION_INDEX.md` (C6 updated; P4 gaps)
- `docs/decisions/README.md`

The prompt names `docs/security-baseline.md`; the repository's file is
`docs/architecture/security-baseline.md`, and that file was updated.

## 33. Specification Gaps

| ID   | Gap                                                               | Handling                                           |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------- |
| P4-1 | "Levels must be customizable" is undefined (names or level count) | Names and descriptions of 0–5 (ADR 0026)           |
| P4-2 | No evidence → level algorithm                                     | skill-level-v1 (ADR 0027)                          |
| P4-3 | Freshness thresholds and "recent" undefined                       | 365 / 730 days (ADR 0028)                          |
| P4-4 | "Critical" gap undefined; no importance field                     | gap-analysis-v1 (ADR 0029)                         |
| P4-5 | Historical trend has no level history                             | Activity trend only                                |
| P4-6 | "Can lead" has no leadership record                               | Verified testimonial or publication                |
| P4-7 | Learning metrics require LearningItem (C4)                        | Unavailable                                        |
| P4-8 | No production flag on evidence beyond `production_metric`         | Production projects + production metrics           |
| P4-9 | 01 §6 "Last used" vs "Last demonstrated" distinction undefined    | Only "last demonstrated" (dated evidence) is shown |

## 34. Deferred Features

| Feature                                                    | Deferred to / blocked by                               |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| Goal ↔ Skill, goal-driven targets                          | Phase 5                                                |
| Learning items, learning velocity, learning paths          | Spec decision (C4)                                     |
| Custom level models in the exchange format (export/import) | Exchange-format extension                              |
| Level-count customisation, per-level custom rules          | Spec decision (needs skill-level-v2)                   |
| Level history snapshots                                    | Would need a persistence decision; never reconstructed |
| AI-assisted skill suggestions                              | Copilot phase                                          |
| Skill importance / weighting for critical gaps             | Spec decision                                          |

## 35. Risks

1. **The rule ladder is a convention.** The thresholds are reasoned (ADR 0027) but not empirically
   validated. Mitigation: full transparency, versioning and a new ADR for any change.
2. **Link strength is user-provided.** A user can overstate strength. Mitigation: higher levels
   also require verification, delivered or production projects, and recognition.
3. **Stale planner statistics after bulk imports.** Large imports could temporarily slow
   aggregates (§28). Mitigation: autovacuum; consider `ANALYZE` after large imports.
4. **Graph readability.** At 150 nodes the force layout is dense. Mitigation: focus mode and the
   list alternative.
5. **Dependency advisory** in lint tooling with no fix yet. Monitor for `braces@3.0.4`.
6. **Export/import of custom level models** is not round-trip safe yet.
7. **No CI and no manual screen-reader audit.**

## 36. Phase 0–3 Regression Status

**No regression.** All earlier suites pass: unit 166/166 and integration 89/89 of the pre-Phase-4
tests, plus E2E smoke 8, Phase 1 10, Phase 2 10 and Phase 3 10.

| Phase | Verified                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | Authentication, ownership, shell, themes, security headers, health (smoke 8/8)                                                                                                       |
| 1     | Skill, evidence and relationship CRUD, import/export, certifications, projects (Phase 1 E2E 10/10; integration)                                                                      |
| 2     | Command Center, catalogue, filters, drill-down, skill snapshot, activity, evidence timeline (Phase 2 E2E 10/10)                                                                      |
| 3     | Project dossier, milestones, project health, portfolio, technology mapping, evidence intelligence, project authorization (Phase 3 E2E 10/10, integration 19/19); delivery-rate guard |

**Intentional changes to earlier behaviour (additive or corrective):**

- The skill page now shows the dossier. The Phase 1 headings and Manage actions are preserved.
- The Phase 1 evidence picker now preserves link demonstration dates.
- All dialogs restore focus to their opener.
- The Command Center gained two KPIs.
- The evidence list accepts `skillId`.

## 37. Phase 5 Readiness

**READY WITH CONDITIONS**

Phase 5 (Goals & Roadmap) can build on:

- skill targets, derived levels, gaps and freshness for goal targets;
- the catalogue, result contract and drill-down invariant;
- the career graph's relation model, which accepts new edge types;
- owner-scoped composite-FK patterns and audit conventions.

**Conditions before Phase 5:**

1. **Unresolved specification decisions:**
   - P4-1 (level count);
   - P4-4 (skill importance);
   - P4-7 (Knowledge/LearningItem, C4);
   - P3-1 (project Users, Business value, Risks);
   - the scope baseline and status history (Phase 3).
     None blocks Phase 5, but goal metrics in 05 (target attainment) will need explicit definitions.
2. **Incomplete acceptance:** trend is PARTIAL (no level history, by design); WCAG is PARTIAL (no
   manual screen-reader audit); CI is PARTIAL; the dependency audit is PARTIAL.
3. **Security:** no open application issues. Add the `braces` override when a patch is published.
4. **Accessibility:** do the manual screen-reader pass, or explicitly waive it. It has been
   outstanding since Phase 2.
5. **Performance:** consider running `ANALYZE` after large imports. Phase 1 project-detail
   relation pagination (Phase 3 condition) is still open.
6. **Migrations:** none pending. Extend the exchange format for milestones (Phase 3) and custom
   level models (Phase 4).
7. **CI:** set it up once a remote exists.

Phase 5 has **not** been started.
