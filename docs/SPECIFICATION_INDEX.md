# PEOS Specification Index

The specification files at the repository root are the **authoritative product contract**. They are
kept byte-for-byte as delivered (excluded from Prettier) and are **not renamed**. Documents named by
earlier prompts but absent from the repository (e.g. `02_ARCHITECTURE.md`, `03_DATABASE.md`,
`04_API.md`, `10_TESTING.md`, `17_TRACEABILITY_MATRIX.md`) **do not exist** and have not been
invented. Use this index to locate what does exist.

## 1. File → scope → implementation area

| Actual file                      | Governs                                                                                                                                                                                                                    | Implementation area (paths)                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `00_MASTER_SPEC.md`              | Product definition, principles, primary navigation (§3), Command Center (§4), entity model (§5), dashboard philosophy (§6), NFRs (§7), Definition of Done (§8), source-of-truth policy (§9)                                | Navigation registry `src/components/shell/navigation.ts`; NFR baselines in `src/lib/**`; Command Center (Phase 2)                              |
| `01_FEATURE_CATALOG.md`          | Functional scope per area: Command Center, Career, Projects, AI Lab, Architecture, Skills & Knowledge, Certifications, Goals, Engineering Health, Evidence Vault, Opportunities, Analytics, Copilot, Search, Notifications | Future `src/modules/*` (Phase 1+); section summaries in the navigation registry                                                                |
| `02_UX_UI_DESIGN.md`             | Design direction, layout (260px nav, 12-col grid, spacing scale), typography, semantic color tokens, Command Center layout, interactions (drill-down, Cmd/Ctrl+K), chart rules, UX states, responsive & a11y rules         | `src/app/globals.css` (tokens, type scale), `src/components/shell/*`, `src/components/layout/*`                                                |
| `03_TECHNICAL_ARCHITECTURE.md`   | Stack, modular Next.js backend, domain module layout, API principles + error shape, analytics pipeline, domain events, AI tool layer, environments, CI stages                                                              | Whole repository layout; `src/lib/errors/app-error.ts`; `src/lib/http/route-handler.ts`; `.github/workflows/ci.yml`; ADRs 0002, 0005–0008      |
| `04_DATA_MODEL.md`               | Core tables and fields, relationships, integrity rules, AuditLog                                                                                                                                                           | `prisma/schema.prisma` (Phase 0: User + auth tables + AuditLog; rest in Phase 1); ADR 0003                                                     |
| `05_ANALYTICS_METRICS.md`        | Metric governance (name, definition, formula, source, frequency, owner, caveats), metric catalogue, visualization catalogue                                                                                                | Phase 2+ analytics; ADR 0007 (chart library)                                                                                                   |
| `06_AI_COPILOT.md`               | Copilot capabilities, tool layer, grounding rules, recommendation shape, AI UX, AI safety                                                                                                                                  | Phase 8; `.env.example` reserves AI variables only                                                                                             |
| `07_SECURITY_PRIVACY.md`         | Threat model, authentication, authorization (user-scoped), AI security, file security, privacy, secrets, security testing                                                                                                  | `src/lib/auth/*`, `src/proxy.ts`, `src/lib/security/csp.ts`, `next.config.ts`, `docs/architecture/security-baseline.md`; ADRs 0003, 0004, 0009 |
| `08_IMPLEMENTATION_PHASES.md`    | Phase 0 (Product Foundation) … Phase 13 deliverables and acceptance                                                                                                                                                        | This phase: `docs/reports/PHASE_00_PRODUCT_FOUNDATION_REPORT.md`; `plannedIn` fields of the navigation registry                                |
| `09_CLAUDE_CODE_INSTRUCTIONS.md` | Build rules (inspect first, no fake functionality, no placeholder UI pretending to work, type safety, validation, tests, observability, a11y, data integrity), DoD per phase, personal-data policy                         | Applied throughout; honest "Not available yet" sections; no seeded personal data                                                               |
| `10_ACCEPTANCE_CRITERIA.md`      | Checklists: Global, Command Center, Projects, Skills, Certifications, AI Lab, Architecture, Copilot, Analytics, Security, Production                                                                                       | Phase reports trace against it                                                                                                                 |
| `11_DATA_IMPORT_PROFILE.md`      | Profile import sources, pipeline with review queue, provenance fields, conflict resolution, website refresh, seed-data rule                                                                                                | Phase 1 (import/export)                                                                                                                        |
| `README.md`                      | Reading order, build philosophy, "execute Phase 0 from 08"                                                                                                                                                                 | —                                                                                                                                              |

Project documentation (not specification): `docs/architecture/`, `docs/decisions/` (ADRs),
`docs/audits/`, `docs/reports/`, `docs/DEVELOPMENT.md`.

## 2. Contradictions and gaps found between specification documents

Only genuine inconsistencies _within the existing specification_ are listed. Each has a recorded
resolution or an explicit deferral; none was resolved by inventing requirements.

| #   | Conflict / gap                                                                                                                                                                                                                                          | Sources                                | Resolution                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `04` defines `Project`, `Skill`, `Technology`, `Goal`, `Evidence`, … **without an owner field**, while `07` requires _"All resources are scoped to the authenticated user."_                                                                            | `04` Core Tables vs `07` Authorization | **ADR 0003**: every user-owned table gets a non-null `userId` FK; enforced in Phase 1 schema. Phase 0 provides `ownedBy()` / `requireResourceOwnership()`.                                                        |
| C2  | Chart library left open: _"Apache ECharts or Recharts"_.                                                                                                                                                                                                | `02` §7, `03` §1                       | **ADR 0007**: Apache ECharts; installed only when the first chart ships (Phase 2).                                                                                                                                |
| C3  | `07` prefers _"passwordless/provider-based authentication where appropriate"_; `03` requires _"a mature authentication provider/library rather than custom password authentication"_; no provider is named.                                             | `07` Authentication, `03` §1           | **ADR 0004**: Better Auth; library-managed email/password (hashing, sessions, rate limits by the library — not custom) plus optional GitHub OAuth. Passwordless/MFA are plugin additions without schema redesign. |
| C4  | Primary navigation includes **Knowledge**, but no phase in `08` schedules it.                                                                                                                                                                           | `00` §3 vs `08`                        | Section exists in the shell as "Not available yet — not yet scheduled in 08". Needs a product decision before Phase 1 planning closes.                                                                            |
| C5  | Entities referenced but undefined in `04`: **Education** (`00` §5, `11`), **Opportunity** (`01` §11), **Notification** (`01` §15), import review queue (`00` §9, `11`), domain events (`03` §6), metric definitions (`03` §5), AI tool-call log (`06`). | `00`, `01`, `03`, `06`, `11` vs `04`   | Deferred to the phase that needs them; Phase 1 must define Education and the import review queue. Not created in Phase 0.                                                                                         |
| C6  | `01` §7 lists Certification **Category**; `04` Certification has no `category`. `00` §5 links **Technology → Skills** and **Goal → Skills**; `04` Relationships omit Technology↔Skill and Goal↔Skill.                                                   | `01`/`00` vs `04`                      | Phase 1 schema decision; record in the Phase 1 ADR.                                                                                                                                                               |
| C7  | Metrics in `00` §4 (e.g. _Technical Debt Trend_, _Production Systems_) and most of `05` lack the formula/source/frequency/owner that `05` "Metric Governance" requires.                                                                                 | `00` §4, `05`                          | Phase 2 must complete a metric catalogue before any KPI is displayed. Phase 0 displays **no** metrics.                                                                                                            |
| C8  | Process naming: the earlier repository audit was labelled "Phase 0", but `08` defines Phase 0 as _Product Foundation_.                                                                                                                                  | `08` vs audit prompt                   | `08` numbering is authoritative. The audit is a pre-phase baseline (`docs/audits/PHASE_00_REPOSITORY_AUDIT.md`).                                                                                                  |
| C9  | The audit prompt referenced **NestJS**; `03` specifies a modular **Next.js** backend.                                                                                                                                                                   | `03` §1 vs prompt                      | **ADR 0002**: Next.js modular monolith; no NestJS.                                                                                                                                                                |

## 3. Resolution status after Phase 1

| #   | Status                                                                                                                                                                                                    | Where                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| C1  | **Resolved.** `user_id` on every user-data table; composite FKs on joins                                                                                                                                  | ADR 0003, ADR 0011           |
| C2  | **Resolved.** ECharts 6 installed (tree-shaken, SVG) in Phase 2                                                                                                                                           | ADR 0007                     |
| C3  | Resolved for Phase 0–1                                                                                                                                                                                    | ADR 0004                     |
| C4  | **Open.** Knowledge remains unscheduled; LearningItem deferred with it                                                                                                                                    | ADR 0017                     |
| C5  | **Partly resolved.** Education designed and built; import review queue built. Opportunity, Notification, domain events, metric definitions and tool-call log remain deferred to their phases              | ADR 0012, ADR 0014, ADR 0017 |
| C6  | **Partly resolved.** Certification `category` added; Technology↔Skill built in Phase 4 (ADR 0030); Goal↔Skill built in Phase 5 (ADR 0032)                                                                 | ADR 0011, ADR 0017           |
| C7  | **Resolved for available metrics** (Phase 3: 52 metrics, 39 available; ADR 0024). Metric catalogue (28 metrics, 19 available) with full governance; 9 KPIs are catalogued as unavailable with their phase | ADR 0019                     |
| C8  | Resolved                                                                                                                                                                                                  | —                            |
| C9  | Resolved                                                                                                                                                                                                  | ADR 0002                     |

New ambiguities found and decided in Phase 1:

| #   | Ambiguity                                                                                                   | Decision                                                 |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| C10 | `04` names `TechnologyUsage.usageType`/`proficiencyEvidence` and `SkillEvidence.strength` without values    | ADR 0011                                                 |
| C11 | `04` `Experience.profileId` vs ownership by user                                                            | ADR 0011 (owned via `user_id`; Profile is 1:1 with User) |
| C12 | `01` §6 "levels must be customizable" vs `08` placing skill levels in Phase 4                               | ADR 0013                                                 |
| C13 | `11` conflict resolution and formats not specified                                                          | ADR 0014                                                 |
| C14 | Phase 1 pages (Profile, Experience, Education, Technologies, Import, Export) absent from `00` §3 navigation | ADR 0016                                                 |
| C15 | `11` lists Languages/Links/Publications, but `04` has no such entities                                      | ADR 0017 (publications → evidence type `publication`)    |

## Phase 3 specification gaps (ADR 0022–0025)

| Gap  | Detail                                                                                                           | Handling                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| P3-1 | `01` §3 project record lists Users, Business value, Risks, Owner and Architecture; `04` Project has none of them | Not added. `impact` is shown; the spec owner should decide |
| P3-2 | Health weights, thresholds, missing-input rules and "planned milestones" are undefined                           | ADR 0024 (model v1)                                        |
| P3-3 | Scope stability needs a committed-scope baseline, which no spec defines                                          | Unavailable component                                      |
| P3-4 | Issue severity needs an issue domain or integration                                                              | Unavailable (Phase 9)                                      |
| P3-5 | Blocked time and lifecycle durations need status history, which is not recorded                                  | Unavailable; never reconstructed                           |
| P3-6 | Portfolio matrix needs numeric impact, complexity and effort                                                     | Unavailable                                                |
| P3-7 | Technology heatmap needs dated usage                                                                             | Unavailable                                                |
| P3-8 | `04` Milestone.goalId — Goals are Phase 5                                                                        | Built in Phase 5 (ADR 0032)                                |

## Phase 4 specification gaps (ADRs 0026–0030)

| Gap  | Detail                                                                                  | Handling                                                                                              |
| ---- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P4-1 | "Levels must be customizable" does not say whether names or the number of levels change | Names and descriptions of the canonical 0–5 scale (ADR 0026)                                          |
| P4-2 | No algorithm maps evidence to a skill level                                             | skill-level-v1 ladder (ADR 0027)                                                                      |
| P4-3 | Freshness thresholds and the meaning of "recent" are undefined                          | 365 / 730 days (ADR 0028)                                                                             |
| P4-4 | "Critical skill gap" is undefined; no skill importance field                            | gap ≥ 2, or below target and stale (ADR 0029)                                                         |
| P4-5 | Historical trend has no level history                                                   | Demonstration-activity trend only (ADR 0028)                                                          |
| P4-6 | Expert / "can lead" has no leadership record                                            | Verified testimonial or publication as the closest real signal (ADR 0027)                             |
| P4-7 | Learning metrics need LearningItem (Knowledge is unscheduled, gap C4)                   | Unavailable (`skills.learning_velocity`)                                                              |
| P4-8 | Production evidence ratio: no production flag on evidence beyond `production_metric`    | `evidence.production_ratio` stays unavailable; skills use production projects plus production metrics |

## Phase 5 specification gaps (ADRs 0031–0035)

| Gap   | Detail                                                                            | Handling                                                                              |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| P5-1  | `10` has no Goals acceptance section; `12_IMPLEMENTATION_GUIDE.md` does not exist | Acceptance taken from `08` Phase 5 and the Phase 5 prompt                             |
| P5-2  | Goal `status` values are not defined                                              | draft · active · on_hold · completed · cancelled with a transition table (ADR 0031)   |
| P5-3  | Hierarchy rules (which level may parent which) are not defined                    | Strictly higher level; levels may be skipped; depth ≤ 3 (ADR 0031)                    |
| P5-4  | `01` §8 "Action" level and `04` Goal 1:N Task — no Task entity exists             | Deferred; milestones are the lowest linked level                                      |
| P5-5  | `00` §5 Goal → Evidence is not in `04`                                            | Deferred (evidence reaches goals through projects and skills)                         |
| P5-6  | Target attainment, on-track and at-risk are named in `05` but not defined         | goal-attainment-v1 and goal-risk-v1 with explicit signals, no score (ADR 0033)        |
| P5-7  | Goal Burndown needs a measurement history                                         | `goal_measurements` (recorded values only) (ADR 0032)                                 |
| P5-8  | Roadmap needs a start date; `04` has only a deadline                              | Optional `startDate` added; spans drawn only between recorded dates (ADR 0035)        |
| P5-9  | No per-goal target level for a skill                                              | The skill's own target and Phase 4 gap are used; no importance is invented (ADR 0032) |
| P5-10 | `confidence` semantics are undefined                                              | Manual self-assessment, shown as entered, never used in a calculation (ADR 0033)      |
| P5-11 | Completion rate denominator is undefined                                          | completed ÷ (completed + overdue), mirroring the Phase 3 delivery rate (ADR 0034)     |
| P5-12 | Priority is not in `04`                                                           | Not added                                                                             |

## Phase 6 specification gaps (ADRs 0036–0040)

| Gap  | Detail                                                                    | Handling                                                                          |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P6-1 | `04` AIExperiment has no run entity, but `01`/`08` require run comparison | `ExperimentRun` added as first-class, append-only (ADR 0037)                      |
| P6-2 | Experiment `status` values undefined                                      | planned · active · completed · abandoned; completion ≠ success (ADR 0037)         |
| P6-3 | "successful experiment rate" undefined; success is subjective             | Owner decision (adopt/reject/inconclusive); adoption rate over decided (ADR 0038) |
| P6-4 | "evaluation score" / "quality" could be an opaque composite               | Per-criterion metrics with units; no composite score (ADR 0038)                   |
| P6-5 | "reproducibility rate" undefined; PEOS cannot re-run                      | Recorded-metadata completeness, labelled as such (ADR 0039)                       |
| P6-6 | No model-execution infrastructure                                         | Registry/tracking only; measurements user-recorded (ADR 0040)                     |
| P6-7 | AI Experiment Scatter Y axis = "quality" is undefined                     | Deferred (no invented composite)                                                  |
| P6-8 | AIExperiment ↔ Skill/Technology not in `04`                               | Deferred; reached through the project link                                        |
| P6-9 | `12_IMPLEMENTATION_GUIDE.md` absent                                       | Recorded, not fabricated; used `00`,`01`,`04`,`05`,`08` + conventions             |

## Phase 7 specification gaps (ADRs 0041–0045)

| Gap  | Detail                                                                | Handling                                                            |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P7-1 | Decision status values undefined                                      | proposed · accepted · rejected · deprecated · superseded (ADR 0042) |
| P7-2 | `04` Project 1:N ADR vs `01` "Related projects" (plural)              | N:M link table; also preserves history on project delete (ADR 0041) |
| P7-3 | "Stale critical decision" (00 §4) undefined; no criticality field     | Revisit due + governs an owner-marked critical component (ADR 0044) |
| P7-4 | No decision date in `04`, but a decision timeline/history is required | `decidedAt` (recorded; required unless proposed) (ADR 0042)         |
| P7-5 | Map node "owner" undefined in a single-user product                   | Not modelled                                                        |
| P7-6 | Map node "incidents" — no incident entity                             | Deferred                                                            |
| P7-7 | Decision ↔ Technology / Skill / AI experiment not in the specs        | Not modelled; technologies reached through governed components      |
| P7-8 | Dated technology usage for a technology heatmap (P3-7)                | Still unavailable                                                   |
| P7-9 | `12_IMPLEMENTATION_GUIDE.md` absent                                   | Recorded, not fabricated                                            |
