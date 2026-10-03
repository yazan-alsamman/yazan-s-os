# PEOS — Phase 7 Architecture Intelligence Report

Date: 2026-10-03 · Repository: `C:/Users/Lenovo/Desktop/yazan/Yazan_Personal_Engineering_OS_Spec` (branch `main`, no remote)

## 1. Executive Summary

Phase 7 makes architecture a first-class, evidence-backed knowledge layer. It is an engineering
intelligence capability, **not** the AI Copilot. PEOS never generates, infers, ranks or recommends
architecture decisions.

- **Architecture decision records (ADRs).** The record carries:
  - the 04 fields: context, problem, decision, consequences, status and revisit date;
  - constraints (from 01 §5);
  - alternatives (04, called "Options" in 01);
  - links to related projects, evidence (the existing Evidence domain) and governed components.
- **An explicit lifecycle** (`decision-lifecycle-v1`): proposed, accepted, rejected, deprecated,
  superseded.
  - Supersession preserves history: superseded decisions stay listed and readable, and supersession
    cycles are rejected.
  - A decision that supersedes others cannot be deleted.
  - Decision history is read from the audit log.
- **Component registry and architecture map.**
  - Six node types from 01 §5, an owner-marked **critical** flag, and links to existing Projects and
    Technologies.
  - Dependencies are explicit records.
  - The map is bounded, draws only persisted edges, and has a table alternative.
- **Revisit and staleness.**
  - _Revisit due_ = accepted and past the recorded revisit date.
  - _Stale critical_ = revisit due and governing a critical component (00 §4 Critical panel).
  - Age alone never makes a decision stale.
- **Documentation gaps** are an explicit list per decision, never a score.
- **Analytics.** 12 new governed metrics, and `architecture.decisions` is now available. The
  catalogue has 101 metrics, 93 available. Every metric and bucket is reconciled to its list.
- **Command Center.** It gains the "Architecture Decisions" KPI and stale critical decisions in the
  attention panel.
- **Project dossier.** Projects now expose their architecture (08 acceptance).

**Explicitly excluded:** AI Copilot, AI-generated or recommended ADRs, autonomous changes,
incidents, decision ↔ skill/technology/AI-experiment links, the dated technology heatmap, and
technical debt (Phase 9).

**Validation:**

| Check                                                              | Result                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Unit                                                               | 239/239                                                                          |
| Integration                                                        | 157/157 (Phase 7 authorization 6/6)                                              |
| E2E specs                                                          | Each passes: Phase 7 16/16, Phase 6 18/18 on re-run                              |
| Full-suite E2E run                                                 | 101 passed, 1 failed (an HTTP 429 from the analytics rate limit, §17), 3 not run |
| Build, typecheck, lint, formatting, Prisma, fresh migration, drift | PASS                                                                             |
| Dependency audit                                                   | PARTIAL (the unchanged dev-only advisory)                                        |

**Phase 8 readiness:** READY WITH CONDITIONS (§21).

## 2. Scope

| Phase 7 requirement (08 / 01 §5 / 10)              | Implemented                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| ADRs (creation, decision, consequences)            | `architecture_decisions`; list, dossier, create/edit (ADR 0041)               |
| Alternatives                                       | `architecture_alternatives`; add/edit/delete in the dossier                   |
| Revisit date                                       | `revisitDate`, revisit due, stale critical (ADR 0044)                         |
| Project relationship                               | `decision_projects`, project dossier "Architecture" section                   |
| Decision history                                   | Lifecycle with supersession; audit-log history in the dossier (ADR 0042)      |
| Component registry                                 | `architecture_components` + projects / technologies / dependencies (ADR 0043) |
| Architecture map / graph, dependency visualization | Bounded `/architecture/map` with a table alternative                          |
| Evidence-backed decisions                          | `architecture_decision_evidence` (Evidence reused)                            |
| Architecture metrics, Command Center               | 13 governed metrics; KPI and Critical-panel items (ADR 0045)                  |

## 3. Repository State

- **Path:** `C:/Users/Lenovo/Desktop/yazan/Yazan_Personal_Engineering_OS_Spec`. Branch `main`,
  **no remote, nothing pushed**.
- **Pre-commit checks:** `pwd`, `git status`, `git branch` and `git remote -v` were run before each
  commit.
- **Staging:** explicit paths only; `git add -A` was never used. No other repository, including the
  home-folder repository, was modified.

| Commit    | Content                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `6f70642` | Architecture decision and component domain, lifecycle and rules (schema, migration) |
| `1af3b4a` | Architecture API, analytics, metric catalogue and Command Center                    |
| `7c39e25` | Architecture UI (decisions, dossiers, component registry, map, analytics) and E2E   |
| _(final)_ | ADRs 0041–0045, documentation and this report                                       |

## 4. Existing-System Inspection

`12_IMPLEMENTATION_GUIDE.md` is still **absent** (recorded, not fabricated). I inspected:

- `00`–`11`, ADRs 0001–0040, the Phase 0–6 reports, and the schema and migrations;
- the API conventions (`defineUserRoute`, `itemRoutes`, `relationRoute`, Zod, `parseId`);
- the catalogue and drill-down invariant, the Evidence, Projects, Technologies, Skills and AI Lab
  domains, the audit and activity code, and the UI architecture and test suites.

**What already existed:**

- an unavailable `architecture.decisions` catalogue stub (Phase 2, unchanged formula
  `COUNT(architecture_decisions)`);
- a "planned" Architecture navigation section;
- a project-dossier note announcing Phase 7.

There was no architecture schema, API, UI or audit behaviour.

**Reused:**

- Projects and the projects list, now with an additive `hasArchitecture` filter;
- Evidence and Technologies, with no duplicate registries;
- the audit and activity feed, the catalogue governance and drill-down invariant, and the Command
  Center pattern;
- `ResourceList`, `RelationPicker`, `EntityFormDialog`, `ChartCard`, `EChart` and `KpiCard`;
- the career-graph rendering pattern, reused for the map.

## 5. Architecture Domain Model

| Table                            | Fields / purpose                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `architecture_decisions`         | title, context, problem, constraints, decision, consequences, status, decidedAt, revisitDate, supersededById |
| `architecture_alternatives`      | decisionId, name, pros, cons, rejectedReason                                                                 |
| `architecture_decision_evidence` | decision ↔ evidence                                                                                          |
| `decision_projects`              | decision ↔ project                                                                                           |
| `decision_components`            | decision ↔ component                                                                                         |
| `architecture_components`        | name, key (unique per owner), type, purpose, critical                                                        |
| `component_projects`             | component ↔ project                                                                                          |
| `component_technologies`         | component ↔ existing technology                                                                              |
| `component_dependencies`         | component depends on component                                                                               |

**Ownership and constraints:**

- Every table carries `user_id` with composite FKs `(x_id, user_id)` to every parent.
- Link tables cascade only the link, so decisions survive project and technology deletion.
- Supersession is a composite self-FK with `NO ACTION`.
- CHECK constraints:
  - `title` and `name` not blank;
  - `(status = proposed) ⇔ decided_at IS NULL`;
  - `(status = superseded) ⇔ superseded_by_id IS NOT NULL`;
  - a decision is not superseded by itself;
  - a component does not depend on itself.

**Design choice:** decision ↔ project is a link table rather than 04's single `projectId`. 01 says
"related projects", and the link table keeps history when a project is deleted (ADR 0041).

## 6. Architecture Lifecycle

`decision-lifecycle-v1` (ADR 0042):

| From       | Allowed to             |
| ---------- | ---------------------- |
| proposed   | accepted, rejected     |
| accepted   | deprecated, superseded |
| rejected   | proposed (reconsider)  |
| deprecated | accepted (reinstate)   |
| superseded | accepted (reinstate)   |

- Same-status updates are allowed; any other transition returns 400.
- `decidedAt` is required unless the status is proposed. It defaults to today (UTC) and cannot be in
  the future.
- Superseding requires the owner's own, non-rejected successor that does not close a cycle.
  Reinstating clears the link; the audit keeps it.
- Every transition is audited in-transaction with its own verb.

## 7. Relationship Model

| Relationship           | Source                          | Notes                       |
| ---------------------- | ------------------------------- | --------------------------- |
| Decision ↔ Project     | 01 §5, 04, 10                   | Link table                  |
| Decision ↔ Evidence    | 00 §5                           | Reuses Evidence             |
| Decision ↔ Component   | 01 §5 node "decisions"          |                             |
| Component ↔ Project    | 01 §5                           |                             |
| Component ↔ Technology | 01 §5                           | Existing Technology records |
| Component → Component  | 08 dependency visualization, 05 | Explicit dependency records |

- **Not implemented, because no specification supports them:** decision ↔ skill, decision ↔
  technology (technologies are reached only through governed components), and decision ↔ AI
  experiment.
- The Phase 6 open item (AIExperiment ↔ Skill/Technology) was **not** resolved here.
- Every relationship is owner-checked in the service (400 for foreign targets) and enforced by
  composite FKs.

## 8. Architecture Evolution

History uses only real, dated records:

- `decidedAt` drives the 00 §4 decision timeline;
- lifecycle transitions are audited events with before/after status;
- supersession links say which decision replaced which.

Superseded, deprecated and rejected decisions remain listed (status filter) and fully readable. The
dossier shows "Superseded by" / "Supersedes" and an audit-based history ("Accepted → Superseded").
Nothing is reconstructed from current state; proposals without a date are excluded from the
timeline rather than given an invented one.

## 9. Architecture Intelligence

All derived values are computed on read and never stored. Each has a definition, source, formula,
caveats and drill-down:

- **In force:** status = accepted.
- **Revisit due (`revisit-v1`):** accepted AND `revisitDate` < today (UTC), with an explanation
  string.
- **Stale critical:** revisit due AND governs ≥ 1 component marked critical, with an explanation.
- **Documentation gaps (`documentation-gaps-v1`):** a list from context, decision, consequences,
  alternatives, projects and evidence. Proposals are not expected to have a decision or
  consequences yet.
- **Project coverage:** projects with ≥ 1 linked decision ÷ all projects. Technologies alone do not
  count.
- **Map:** bounded, persisted edges only.

## 10. Metrics Catalogue

All metrics are owned by `PEOS Architecture domain`, computed on request, point-in-time, and carry
the scope caveat plus the caveats noted below.

| Key                                          | Type         | Formula                                       | Drill-down                       |
| -------------------------------------------- | ------------ | --------------------------------------------- | -------------------------------- |
| `architecture.decisions` (v2, now available) | count        | COUNT(architecture_decisions)                 | `/architecture`                  |
| `architecture.decisions_in_force`            | count        | status = accepted                             | `inForce=true`                   |
| `architecture.decisions_by_status`           | distribution | GROUP BY status                               | `status=`                        |
| `architecture.revisit_due`                   | count        | accepted ∧ revisitDate < today                | `revisitDue=true`                |
| `architecture.stale_critical_decisions`      | count        | revisit due ∧ critical components ≥ 1         | `staleCritical=true`             |
| `architecture.decisions_without_evidence`    | count        | 0 evidence links                              | `hasEvidence=false`              |
| `architecture.decisions_with_gaps`           | count        | gap list non-empty                            | `incomplete=true`                |
| `architecture.decision_timeline`             | distribution | GROUP BY month(decidedAt); proposals excluded | `decidedFrom/To`                 |
| `architecture.project_coverage`              | ratio        | projects with ≥ 1 decision ÷ projects         | `/projects?hasArchitecture=true` |
| `architecture.components`                    | count        | COUNT(components)                             | `/architecture/components`       |
| `architecture.components_by_type`            | distribution | GROUP BY type                                 | `type=`                          |
| `architecture.critical_components`           | count        | critical = true                               | `critical=true`                  |
| `architecture.components_without_decisions`  | count        | 0 decision links                              | `hasDecisions=false`             |

Full definitions, caveats and spec references are in `docs/architecture/metric-catalogue.md`,
regenerated from code. Catalogue totals: **101 metrics, 93 available**. No existing formula changed.
`engineering.technical_debt_trend` remains unavailable (Phase 9).

## 11. API

All Phase 7 endpoints are under `/api/v1/architecture/…` plus `/api/v1/analytics/architecture`.
The full table is in `docs/architecture/api.md`:

- decisions: CRUD, intelligence, three relation PUTs, and alternatives POST/PATCH/DELETE;
- components: CRUD, intelligence and three relation PUTs;
- the map, and analytics.

**Authorization and conventions:**

- Session required (401 otherwise); owner from the session; `userId`/`ownerId` stripped.
- Foreign or missing records → 404; foreign link targets → 400; malformed ids → 404; invalid input
  or an over-limit map → 400.
- Reads use the analytics rate limit; mutations use the mutation limit plus the same-origin check.
- Every mutation is audited.

The projects list gained `hasArchitecture`.

## 12. UX

**Pages:**

- `/architecture` — the decisions list, which is the metric source;
- `/architecture/:id` — the decision dossier;
- `/architecture/components` and `/architecture/components/:id`;
- `/architecture/map`;
- `/architecture/analytics`.

There are tabs across the section, the Architecture navigation is available, and the project
dossier has an **Architecture** section.

**Decision dossier:**

- status, decision date and revisit badges;
- lifecycle actions, with dialogs for accepting or rejecting (decision date) and superseding
  (successor picker);
- the decision record, a revisit panel with its explanation, and a documentation-gaps list;
- alternatives (add, edit, delete);
- related projects, governed components and evidence via pickers;
- supersession links and the audit history.

**Component dossier:** purpose, critical flag, governing decisions, depends on and used by (pickers
exclude the component itself), projects and technologies.

**Map:**

- an SVG force graph showing components only (shapes by type, larger when critical, arrowheads for
  dependencies);
- type and limit controls kept in the URL;
- a table alternative listing every component and what it depends on.

**States:** loading skeletons, error with retry, "not found" pages, empty states, and missing-data
states ("Not linked to a project", "No evidence linked", "No alternatives recorded", "Revisit dates
apply to accepted decisions only").

**Responsive:** no horizontal page scroll at 375, 768 and 1440 px (E2E). Dark theme passes axe;
keyboard focus returns from dialogs.

## 13. Security

- Owner isolation is enforced on every record, link, list, dossier, map and analytics query, both in
  the service layer and by database composite FKs.
- Validation uses Zod, with strict enums for status and component type and bounded sizes.
- Audit covers every mutation with actor, entity, action, timestamp, request id and before/after
  snapshots (domain fields only).
- Architecture details are treated as sensitive: React rendering, the CSV injection guard, and no
  logging of content.
- The rate limits were **not** relaxed (§17).
- The 2-user IDOR matrix is described in §16.

## 14. Database

- **Migration:** `20261003125009_architecture_intelligence`. It is additive: 2 enums, 9 tables,
  indexes, FKs and 7 named CHECK constraints. It contains no DROP, DELETE, TRUNCATE or rewrite
  (`ON DELETE` appears only in FK clauses).
- **Indexes:**
  - `architecture_decisions`: `(user_id, status)`, `(user_id, decided_at)`, `(superseded_by_id)`
    and `(id, user_id)`;
  - `architecture_components`: `(user_id, type)`, `(user_id, key)` (unique) and `(id, user_id)`;
  - reverse-side indexes on every link table.
- **Applied** to `peos` and `peos_test`; `migrate status` is up to date; **drift exit 0**.
- **From zero:** a fresh DB took all 7 migrations, drift exit 0, and integration passed 157/157 on
  it. The fresh DB was dropped afterwards.
- No seed data.

## 15. Performance

Dataset (one user):

- 2,000 decisions and 1,000 components;
- 1,000 projects;
- 2,000 decision–project, 4,000 decision–component and 1,000 decision–evidence links;
- 2,000 alternatives and 2,000 dependencies;
- 1,000 component–project and 1,000 component–technology links;
- 50,000 audit rows.

Each call ran once as an excluded warm-up and then 10 timed times. Cells are median / max in ms.

| Call                                | Run a (`ANALYZE`) | Run b (no `ANALYZE`) | Run c (no `ANALYZE`) |
| ----------------------------------- | ----------------- | -------------------- | -------------------- |
| Decision list (page 1)              | 54.5 / 65.1       | 59.7 / 79.8          | 55.9 / 68.8          |
| Decision list (stale critical)      | 51.2 / 59.4       | 52.0 / 58.6          | 51.1 / 60.3          |
| Decision dossier (incl. history)    | 13.2 / 20.5       | 29.0 / 38.8          | 28.0 / 37.5          |
| Component list                      | 30.3 / 40.9       | 31.8 / 36.7          | 32.5 / 43.6          |
| Component dossier                   | 12.4 / 18.9       | 17.2 / 30.3          | 17.5 / 23.8          |
| Map (100 nodes)                     | 8.2 / 9.4         | 8.7 / 10.1           | 8.6 / 10.2           |
| Map (150 nodes)                     | 9.2 / 9.8         | 10.0 / 12.5          | 9.7 / 10.7           |
| Architecture analytics              | 79.2 / 91.8       | 81.3 / 97.8          | 86.2 / 109.6         |
| Command Center (incl. architecture) | 106.3 / 131.9     | 119.9 / 142.1        | 114.0 / 133.1        |

**Verified fix.** Without `ANALYZE`, the first map implementation measured 652–660 ms. Timing each
query in that stale-statistics state showed:

| Query                                                    | Median   |
| -------------------------------------------------------- | -------- |
| Node query with Prisma's per-row relation `_count` (old) | 646.5 ms |
| Plain node query                                         | 3.6 ms   |
| Grouped decision count over the same ids                 | 3.8 ms   |

The map now uses the grouped count and measures 8–10 ms in every run.

**Query strategy:**

- Decisions: one query plus five grouped counts.
- Components: one query plus six grouped counts.
- The map: three bounded queries.
- No N+1 anywhere; lists are paginated (≤ 100).
- Whole-set analysis per request is bounded by the per-user caps (2,000 decisions, 1,000
  components).

## 16. Testing

```
Unit:                 239/239 (26 files; +13: architecture.rules 9, architecture-intelligence 4)
Integration:          157/157 (20 files; +16: architecture 10, architecture-authz 6)
Authorization:        Phase 7: 6/6 HTTP tests with two real users (within integration)
E2E:                  105 tests in 7 specs. Phase 7 spec 16/16 (alone and in the full run).
                      Full run: 101 passed, 1 failed, 3 did not run — the failure was an HTTP 429
                      from the per-user analytics rate limit on a Phase 6 test (§17); the Phase 6
                      spec re-run passed 18/18.
Accessibility (axe):  Phase 7 spec has 9 axe call sites (list, dossiers, map, analytics, missing
                      data, dark ×4 pages, phone ×5 pages, empty account), 0 violations
Build:                PASS
Typecheck:            PASS (next typegen + tsc)
Lint:                 PASS (0 warnings)
Formatting:           PASS
Prisma format:        PASS
Prisma validate:      PASS
Prisma generate:      PASS
Fresh migration:      PASS (7 migrations; integration 157/157 on the fresh DB)
Migration drift:      PASS (exit 0)
Dependency audit:     PARTIAL — 1 high: braces <=3.0.3 via eslint-config-next (dev-only, unchanged,
                      no patched release); `pnpm audit --prod`: no known vulnerabilities
CI:                   NOT RUN — no remote
Manual screen reader: NOT RUN — requires a human
```

**Unit tests cover:**

- the full transition table and status-dependent fields (decision date, successor);
- audit verbs and supersession cycles, including a 2,000-long chain;
- revisit due at the UTC boundary and stale critical (never age alone);
- documentation gaps, including the proposal exemption;
- validation: owner stripping, create statuses, map bounds;
- deterministic ordering;
- list ⇔ metric predicate equivalence;
- every architecture drill-down.

**Integration tests cover:**

- the lifecycle with its exact audit sequence;
- the 409 when deleting a decision that supersedes others;
- rejection of illegal transitions, supersession cycles, rejected successors and future dates;
- the DB CHECKs;
- links to projects, evidence and technologies, with decisions surviving project and technology
  deletion;
- alternatives CRUD with audit;
- the dossier history and supersession links;
- dependencies, case-insensitive duplicate names and the bounded map (edges only among included
  nodes);
- every metric and bucket equal to its list total, including project coverage against the projects
  list;
- Command Center equality, empty-account no-data states, and server-side filters, sort and
  pagination.

**Authorization tests (two real users):**

- 401 without a session;
- 404 for foreign decisions, alternatives and components (read, update, delete, dossier);
- 404 when replacing a foreign record's relationships;
- 400 when linking a foreign project, evidence, component, technology or successor;
- injected owner ids are ignored;
- lists, map and analytics are isolated, including a foreign-project filter;
- malformed ids, invalid input and an over-limit map are rejected.

**Changed existing tests.** The requirement changed in each case; no assertion was weakened.

| File                 | Change                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `navigation.test.ts` | architecture is now available                                                                             |
| `analytics.test.ts`  | counts are now 101 / 93                                                                                   |
| `drilldown.test.ts`  | the "no drill-down" check now uses `engineering.technical_debt_trend`; a timeline sample bucket was added |
| `phase2.spec.ts`     | expects "Unavailable — Phase 9"                                                                           |
| `smoke.spec.ts`      | the unavailable-section check now uses Knowledge                                                          |

## 17. Known Limitations

1. **E2E vs the analytics rate limit.** The limit is 120 reads/min per user in a fixed window. The
   single-worker suite runs many page loads per minute for one user and can cross the limit
   depending on window alignment. The UI then correctly shows "Too many requests" and the test
   fails. This surfaced on a Phase 6 test during the full run. I did **not** change the security
   policy or add a test bypass. Options for a human decision:
   - a loopback-only test switch, like the existing `AUTH_RATE_LIMIT_DISABLED`;
   - per-spec accounts or pacing.
2. **Phase 6 documentation slip, now fixed.** In the Phase 6 commit, `docs/architecture/analytics.md`
   was not Prettier-formatted (a table inserted after the format pass). It is formatted in this
   phase's docs commit.
3. **No incidents and no component "owner"** (gaps P7-5, P7-6).
4. **Decisions link to technologies only through components**, not directly.
5. **Decision history comes from the audit log.** It starts with Phase 7 and shows at most 100
   events.
6. **No manual screen-reader audit; no CI.**

## 18. Specification Gaps

Recorded as P7-1…P7-9 in `docs/SPECIFICATION_INDEX.md`:

- P7-1: undefined status values;
- P7-2: 04's single project vs 01's plural related projects;
- P7-3: undefined "stale critical decision";
- P7-4: no decision date in 04;
- P7-5: node "owner";
- P7-6: incidents;
- P7-7: decision ↔ technology/skill/experiment links;
- P7-8: dated technology usage;
- P7-9: the absent implementation guide.

Each is resolved by an ADR or left explicitly unimplemented. No major product semantic was silently
invented.

## 19. Deferred Work

| Item                                                              | Deferred to / blocked by                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Incidents on map nodes                                            | An incident entity (spec decision)                              |
| Direct decision ↔ technology / skill / AI experiment links        | Spec decision                                                   |
| Technology heatmap over time                                      | Dated technology usage (P3-7)                                   |
| AI-assisted architecture summaries, ADR drafting, recommendations | Phase 8 (Copilot), only with explicit user action               |
| Technical debt trend                                              | Phase 9                                                         |
| Architecture records in the export/import exchange format         | Exchange-format extension (with milestones, goals, experiments) |
| E2E rate-limit strategy                                           | Human decision (§17)                                            |

## 20. Regression Status

There is no functional regression.

- Unit 239/239 and integration 157/157 include all earlier tests.
- E2E by spec: smoke 8, Phase 1 10, Phase 2 10, Phase 3 10, Phase 4 14, Phase 5 19, Phase 6 18 (on
  re-run) and Phase 7 16.
- The single full-run failure was the rate limit described in §17.

Intentional changes to earlier behaviour (additive):

- Architecture navigation and pages replace the placeholder.
- The Command Center gained one KPI and an attention item type.
- The project dossier gained an Architecture section, and its Phase 6 note now links to the AI Lab.
- The projects list accepts `hasArchitecture`.
- `architecture.decisions` moved from unavailable to available (version 2, same formula).

## 21. Phase 8 Readiness

**READY WITH CONDITIONS.**

Phase 8 (AI Copilot) can ground on structured, owner-scoped architecture records (`06` names a
`getArchitectureDecisions(filters)` tool), alongside the Phase 1–6 domains.

Conditions; none blocks starting Phase 8:

1. Decide the E2E rate-limit strategy (§17) before the suite grows further.
2. Open spec decisions: P7-5/6/7/8 plus the earlier open items (Tasks, Goal ↔ Evidence, learning,
   AIExperiment ↔ Skill/Technology).
3. Manual screen-reader audit, dependency audit and CI remain PARTIAL.
4. Any Copilot use of architecture data must keep the "never generate decisions without explicit
   user action" rule (ADR 0041).

Phase 8 has **not** been started.
