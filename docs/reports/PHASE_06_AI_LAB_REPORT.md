# PEOS — Phase 6 AI Lab & Experimentation Report

Date: 2026-10-03 · Repository: `Yazan_Personal_Engineering_OS_Spec` (dedicated repo, branch `main`, no remote)

## 1. Executive Summary

Phase 6 adds the **AI Lab**: a rigorous, evidence-based record of AI/ML engineering experiments —
their hypotheses, the runs that were tried, the results that were measured, and how runs compare.
It is an experimentation **registry**, not the AI Copilot.

- **PEOS does not execute models.** There is no provider integration and no model execution
  (ADR 0040). Every cost, latency, token count and evaluation value is a **user-recorded fact**;
  nothing is computed, estimated or fabricated, and a missing value is shown as "not recorded",
  never zero.
- **Domain:** `AIExperiment` (registry: hypothesis, objective, decision, lifecycle) → append-only
  `ExperimentRun` (one iteration, with the model/config and measured cost/latency/tokens) →
  `ExperimentMetric` (per-criterion recorded evaluation) → `ExperimentEvidence` (reuses Evidence).
- **Completion ≠ success:** three independent axes — experiment lifecycle status, run execution
  status, and the owner's decision (adopt/reject/inconclusive) — are kept separate (ADR 0037).
- **Reproducibility** is a recorded-metadata-completeness classification (reproducible / partial /
  not recorded / unknown), explicitly labelled "not a verified reproduction" (ADR 0039).
- **Comparison** diffs two runs (config changes, cost/latency/token deltas, per-metric deltas by
  each metric's own direction) and never declares an overall winner (ADR 0038).
- **No opaque "AI score":** evaluation is per-criterion with units; "adoption rate" is the owner's
  decision rate; cost/latency/token figures are descriptive run summaries, not governed KPIs.
- **Analytics & Command Center:** 13 new governed metrics (reconciled to the experiments list);
  `ai.experiments` is now available; the Command Center gains an Active-experiments KPI.

**Validation:** unit 226/226 · integration 141/141 (AI Lab authorization 7/7) · E2E 89/89 · axe on
every new surface, 0 violations · build, typecheck, lint, formatting, Prisma, fresh migration and
drift **PASS** · dependency audit **PARTIAL** (unchanged dev-only advisory).

**Phase 7 readiness:** **READY WITH CONDITIONS** (§21).

## 2. Scope

Implemented (01 §4, 04, 05, 08 Phase 6): experiment registry; runs/iterations; per-criterion
evaluation; run comparison; model tracking; recorded cost/latency/tokens; reproducibility
classification; AI Lab analytics and Command Center KPI; full API, audit, ownership; UI (list,
dossier, comparison, analytics); tests and docs.

Explicitly **not** implemented: the AI Copilot (Phase 8); model execution / provider integration;
AI recommendations or advice; Architecture Intelligence (Phase 7); the AI Experiment Scatter
(deferred — its "quality" axis has no single defensible definition); AIExperiment↔Skill/Technology
direct links (not in 04 — reached via the project); any credential storage.

## 3. Repository State

- Branch `main`; no remote; nothing pushed; the home-folder repository was not modified.
- Pre-commit checks (`pwd`, `git status`, `git branch`, `git remote -v`) confirmed the root is
  `C:/Users/Lenovo/Desktop/yazan/Yazan_Personal_Engineering_OS_Spec`. Files staged by explicit
  path; `git add -A` never used.

| Commit    | Content                                                          |
| --------- | ---------------------------------------------------------------- |
| `98c037f` | AI experiment domain — schema, lifecycle, runs, evaluation rules |
| `5f5ccc3` | AI Lab API, analytics, metric catalogue and Command Center       |
| `63c1272` | AI Lab UI, dossier, comparison, analytics views and E2E          |
| _(final)_ | ADRs 0036–0040, documentation and this report                    |

## 4. Existing-System Inspection

`12_IMPLEMENTATION_GUIDE.md` **does not exist** (recorded, not fabricated). Scope was taken from
`00`, `01` §4, `04`, `05`, `08` Phase 6, `07`, `10`, and the Phase 0–5 implementation and reports.

Reused, not duplicated: `defineUserRoute` / `itemRoutes` / `relationRoute`, composite-FK ownership,
`auditInTx`, `requireFound` / `assertAllOwned`; the metric catalogue + `MetricResult` contract +
drill-down invariant; the Command Center KPI pattern; the **measurement-as-recorded-fact** pattern
from Phase 5 goals; the Evidence domain; `ResourceList` / dossier panels / `RelationPicker` /
`EntityFormDialog` / `ChartCard` / `EChart` / `KpiCard`; the UTC calendar; the pre-existing
catalogue stub `ai.experiments` (was `unavailable → Phase 6`).

## 5. AI Lab Domain Model

| Table / column        | Purpose                                                 | Ownership                                                 |
| --------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `ai_experiments`      | Registry entry: hypothesis, objective, status, decision | `user_id`; `(project_id, user_id)` FK (cascade), optional |
| `experiment_runs`     | One iteration: config + measured cost/latency/tokens    | `(experiment_id, user_id)` FK (cascade)                   |
| `experiment_metrics`  | Recorded evaluation result per run                      | `(run_id, user_id)` FK (cascade)                          |
| `experiment_evidence` | Experiment ↔ Evidence (reuses Evidence)                 | composite FKs to experiment and evidence                  |

Enums: `experiment_status` (planned·active·completed·abandoned), `experiment_decision`
(adopt·reject·inconclusive), `experiment_run_status` (completed·failed·aborted). Relationship:
Project 1:N AIExperiment (04). Every field has a clear provenance (04 / 01 §4), no speculative
fields; no provider/credential field exists (ADR 0040).

## 6. Experiment Lifecycle

`experiment-lifecycle-v1` (ADR 0037): `planned → active → completed`; `abandoned` from
planned/active; `completed → active` (reopen); `abandoned → planned|active` (restore). Same-status
allowed; other transitions 400. `completed ⇔ completedAt`; completing defaults to today (UTC),
future/stray dates rejected, reopening clears it; `startedAt ≤ completedAt` (DB check). Audited as
`created / updated / completed / reopened / abandoned / deleted`. **Completion is never equated
with success** — that is the separate `decision`.

## 7. Run / Iteration Model

Runs are **first-class and append-only** (ADR 0037): never overwritten; `runNumber` increments per
experiment and is not reused after a delete, so history is preserved. A run holds the config that
varies per attempt (model, modelVersion, provider, promptVersion, datasetName, datasetVersion,
codeRef, environment, runAt) and the **measured** `costUsd`, `latencyMs`, `tokensInput`,
`tokensOutput` (all optional; null = not recorded). Run execution status (completed/failed/aborted)
is distinct from the experiment's decision. ≤ 500 runs per experiment.

## 8. Evaluation Model

`ExperimentMetric` per run: `name` (criterion, e.g. accuracy, groundedness, human rating), `value`
(finite, recorded), `unit`, `higherIsBetter` (true/false/null = no direction), `note`. Criteria are
extensible and domain-specific (01 §4). **No opaque composite "AI score"** (ADR 0038). ≤ 100
metrics per run. A run with ≥ 1 metric counts as "evaluated".

## 9. Reproducibility Model

`reproducibility-v1` (ADR 0039) over the recorded fields `model, modelVersion, promptVersion,
datasetName, codeRef` (blank = absent): a run is `reproducible` (all five), `partial` (some) or
`not_reproducible` (none). An experiment is `unknown` with no runs, else its best run. Every
explanation states it measures **recorded metadata only — not a verified reproduction**. The free
-text `reproducibilityNote` captures the owner's own caveats.

## 10. Metrics Catalogue

13 new governed metrics (version 1) plus `ai.experiments` (version 2, now available). All in
`src/modules/analytics/metric-catalogue.ts` with key, name, definition, formula, source, frequency,
owner (`OWNER.ai`), caveats, value type, temporal semantics, drill-down and spec reference; the
catalogue doc was regenerated from code.

| Key                                 | Type         | Drill-down                         |
| ----------------------------------- | ------------ | ---------------------------------- |
| `ai.experiments`                    | count        | Experiments list                   |
| `ai.active_experiments`             | count        | `open=true`                        |
| `ai.completed_experiments`          | count        | `status=completed`                 |
| `ai.abandoned_experiments`          | count        | `status=abandoned`                 |
| `ai.runs_total`                     | count        | `hasRuns=true`                     |
| `ai.experiments_by_status`          | distribution | per status                         |
| `ai.experiments_by_decision`        | distribution | per decision (undecided: none)     |
| `ai.experiments_by_category`        | distribution | per category (uncategorised: none) |
| `ai.reproducibility_distribution`   | distribution | per reproducibility state          |
| `ai.adoption_rate`                  | ratio        | `decision=adopt` (numerator)       |
| `ai.evaluation_coverage`            | ratio        | `hasEvaluation=true` (numerator)   |
| `ai.experiments_missing_evaluation` | count        | `hasRuns=true&hasEvaluation=false` |
| `ai.experiments_missing_provenance` | count        | `hasEvidence=false`                |
| `ai.experiments_per_month`          | distribution | `createdFrom/To` of the month      |

Totals: **89 metrics, 80 available** (was 76 / 66). Cost/latency/token figures are **descriptive
run summaries**, not catalogue metrics (ADR 0038). **Adoption rate** = decision=adopt ÷ decided
(05's "successful experiment rate", honestly defined); empty → insufficient data, never 0 %.

## 11. API

See `docs/architecture/api.md` for the full table. Endpoints: `GET·POST /experiments`;
`GET·PATCH·DELETE /experiments/:id`; `GET /experiments/:id/intelligence`;
`GET /experiments/:id/compare?a=&b=`; `POST /experiments/:id/runs`;
`PATCH·DELETE /experiments/:id/runs/:runId`; `POST /experiments/:id/runs/:runId/metrics`;
`DELETE …/metrics/:metricId`; `PUT /experiments/:id/evidence`; `GET /analytics/experiments`.
All owner-scoped via the session (PEOS conventions, ADR 0015), Zod-validated, `userId`/`ownerId`
stripped, malformed ids → 404, foreign targets → 400, mutations audited, reads on the `analytics`
rate limit; no raw unsafe SQL.

## 12. UX

- **Pages:** `/ai-lab` (experiments list — the metric source list), `/ai-lab/:id` (dossier),
  `/ai-lab/analytics`; tabs Experiments | Analytics; AI Lab navigation now available.
- **Dossier:** header badges (status, decision, reproducibility, completion), lifecycle actions,
  edit/delete, an experiment/reproducibility overview, append-only **runs** (each with config,
  measured values, per-run reproducibility and an evaluation table; add/edit/delete run; add/delete
  metric), **run comparison** (two selectors → config/measure/metric deltas, no winner), and
  **evidence** (RelationPicker over the Evidence domain).
- **Four visual registers kept distinct:** recorded facts, derived analytics, the owner's
  interpretation (decision/result/notes), and missing information — never merged into one "AI
  insight".
- **States:** loading skeletons, error+retry, "Experiment not found" (missing/foreign), empty
  states on all three pages, and explicit missing-data ("No runs recorded", "Not recorded",
  "Unknown", "No evidence linked", "Not evaluated").
- **Responsive** (E2E, no horizontal page scroll) at 375 / 768 / 1440 px; dark theme axe-clean;
  keyboard: dialogs open on Enter and return focus on Escape.

## 13. Security

- **No execution, no secrets** (ADR 0040): no provider calls, no credential field; records hold
  model/version/dataset/code-ref labels and notes only. React rendering + the shared CSV
  formula-injection guard.
- **Ownership:** composite FKs on every table and the project link; session-derived identity;
  `userId`/`ownerId` stripped. Two parameterised `$queryRaw` aggregates per analysis (owner on
  every predicate); no `$queryRawUnsafe`.
- **IDOR:** `tests/integration/experiments-authz.int.test.ts` (HTTP, two real users, 7 tests) —
  reading/updating/deleting/analysing a foreign experiment, run and metric (404); linking foreign
  evidence or a foreign project (400); injected owner ids ignored; lists and analytics isolated;
  malformed ids 404, invalid input 400.
- **Audit:** all experiment, run, metric and evidence mutations in-transaction (§19).

## 14. Database

- Migration `20261003082203_ai_lab`: additive only — `CREATE TYPE` (3 enums), `CREATE TABLE` (4),
  indexes, FKs, and 9 appended named CHECK constraints (title/name not blank; runNumber ≥ 1;
  non-negative cost/latency/tokens; finite metric value). No `DROP`/`DELETE`/`TRUNCATE`/rewrite
  (`ON DELETE` appears only in FK clauses).
- Indexes: `ai_experiments(user_id, status)`, `(user_id, created_at)`, `(project_id)`,
  `(id, user_id)`; `experiment_runs(experiment_id)`, `(user_id)`, `(id, user_id)`,
  `(experiment_id, run_number)` unique; `experiment_metrics(run_id)`;
  `experiment_evidence(evidence_id)`.
- Applied to `peos` and `peos_test`; `migrate status` up to date; **drift exit 0**. From zero: a
  fresh `peos_fresh` received all 6 migrations and the integration suite passed on it (§16); dropped
  afterwards. No seed data.

## 15. Performance

Dataset (one user): 1,000 experiments, 2,500 runs, 3,332 evaluation metrics, 50 projects.
PostgreSQL 17.10, service layer, 1 warm-up + 10 timed runs; median = mean of runs 5 and 6 (ms).

| Call                              | Run a (`ANALYZE`) | Run b (no `ANALYZE`) | Run c (no `ANALYZE`) |
| --------------------------------- | ----------------- | -------------------- | -------------------- |
| Experiment list (page 1)          | 32.3 / 47.2       | 36.9 / 53.9          | 40.0 / 49.7          |
| Experiment list (reproducibility) | 30.5 / 40.8       | 35.2 / 38.6          | 36.9 / 49.4          |
| Experiment dossier                | 11.2 / 12.1       | 12.0 / 12.6          | 14.2 / 23.3          |
| Run comparison                    | 8.3 / 9.5         | 7.3 / 9.5            | 9.7 / 12.1           |
| AI Lab analytics                  | 40.4 / 45.4       | 46.1 / 56.7          | 53.7 / 60.3          |
| Command Center (incl. AI Lab)     | 68.9 / 86.2       | 85.9 / 99.8          | 83.6 / 96.1          |

Query strategy: one experiment query + two run aggregates + one latest-run query + one evidence
aggregate for any number of experiments (no N+1); the dossier adds bounded reads; comparison loads
exactly two runs. Lists paginated (≤ 100); runs ≤ 500, metrics ≤ 100 per parent; analysis over the
per-user cap (≤ 2,000). **No stale-statistics outlier** appeared (the aggregates are small), so the
no-`ANALYZE` runs track the `ANALYZE` run; bulk imports should still `ANALYZE` afterwards.

## 16. Testing

```
Unit:                 226/226 (24 files; +12 AI Lab: experiment.rules 8, experiment-intelligence 4)
Integration:          141/141 (18 files; +17 AI Lab: experiments 10, experiments-authz 7)
Authorization:        AI Lab 7/7 (two real users), within integration
E2E:                  89/89 (phase6.spec.ts: 18)
Accessibility (axe):  new surfaces covered — phase6 has 7 axe assertions (list, dossier, analytics,
                      dark ×3, phone), 0 violations
Build:                PASS
Typecheck:            PASS (next typegen + tsc)
Lint:                 PASS (0 warnings)
Formatting:           PASS
Prisma format:        PASS
Prisma validate:      PASS
Prisma generate:      PASS
Fresh migration:      PASS (6 migrations; integration passed on the fresh DB)
Migration drift:      PASS (exit 0)
Dependency audit:     PARTIAL — 1 high: braces <=3.0.3 (GHSA-vfj7-8cjw-p6xm) via eslint-config-next
                      (dev-only lint tooling, unchanged since Phase 4, no patched release).
                      `pnpm audit --prod`: no known vulnerabilities.
CI:                   NOT RUN — no remote or CI (not configured, by instruction)
Manual screen-reader: NOT RUN — requires a human with NVDA/VoiceOver
```

Unit: lifecycle transition table, completion-date rules, transition verbs, per-run and
experiment-level reproducibility (including blank-field handling), run comparison (config changes,
lower-is-better deltas, per-metric direction, incomparable/no-direction, no winner), ownership
stripping, non-negative measures; deterministic ordering; list = metric predicate equivalence; all
AI Lab drill-downs. Integration: lifecycle with the exact audit sequence; illegal-transition and
future-completion rejection; append-only runs with a DB CHECK; reproducibility and dossier from
real runs; recorded-fact measurements (null, not zero); comparison; **every metric and bucket =
its drill-down list total**; Command Center equality; empty-account no-data; server-side filters,
sort and pagination.

Changed existing tests (requirement changed, not weakened): `navigation.test.ts` (ai-lab joins the
available sections), `analytics.test.ts` (89/80), `drilldown.test.ts` (ai.experiments now has a
drill-down; the no-drill assertion uses `architecture.decisions`; per-month sample bucket added),
`phase2.spec.ts` + `smoke.spec.ts` (AI Lab now available → assertions retargeted to Phase 7 /
Architecture), `playwright.config.ts` (expect timeout raised for the single-worker suite;
assertions unchanged).

## 17. Known Limitations

- PEOS records experiments; it cannot run them, so all measurements depend on honest owner entry.
- Reproducibility reflects recorded metadata completeness, not a verified re-run.
- Cost/latency/token figures are descriptive run aggregates, not reconciled Command-Center KPIs.
- The AI Experiment Scatter is deferred (no defensible single "quality" axis).
- No manual screen-reader audit; no CI (no remote).

## 18. Specification Gaps

Recorded in `docs/SPECIFICATION_INDEX.md` as P6-1…P6-9 (run entity absent from 04 but required by
01/08; undefined status values; subjective "success"; opaque "evaluation score"; undefined
"reproducibility rate"; no execution infra; undefined scatter "quality" axis; no
AIExperiment↔Skill/Technology in 04; absent `12_IMPLEMENTATION_GUIDE.md`). Each resolved by an ADR
or an explicit deferral — no major product decision was silently invented.

## 19. (Audit) — mutations covered

`ai_experiment.created/updated/completed/reopened/abandoned/deleted`,
`ai_experiment.relations_updated` (evidence id lists only), `experiment_run.created/updated/deleted`,
`experiment_metric.created/deleted` — all written inside the mutation's transaction with actor and
ownership; analytics are not audited. (Audit entities/verbs added to `src/modules/shared/audit.ts`.)

## 20. Regression Status (Phases 0–5)

No behaviour removed. Full suites pass: unit 226/226, integration 141/141, E2E 89/89 (smoke 8,
Phase 1 10, Phase 2 10, Phase 3 10, Phase 4 14, Phase 5 19, Phase 6 18). Additive changes only: the
AI Lab navigation and pages replace the placeholder; the Command Center gained the
Active-experiments KPI and an `experiments` block; milestones/goals/skills/projects unchanged. The
`ai.experiments` catalogue entry moved from unavailable to available (version 2); no existing
formula changed.

## 21. Phase 7 Readiness

**READY WITH CONDITIONS.** Phase 7 (Architecture Intelligence) can build on the experiment domain,
the catalogue/drill-down invariant, the owner-scoped composite-FK and audit patterns, and the
evidence-first provenance model.

Conditions (none blocks starting Phase 7):

1. Open spec decisions: AIExperiment↔Skill/Technology links (P6-8), the Scatter "quality" axis
   (P6-7), and the still-open earlier-phase items (Tasks, Goal↔Evidence, learning, etc.).
2. Incomplete acceptance: manual screen-reader audit, dependency audit and CI remain PARTIAL.
3. Security: no open application issues; add the `braces` override when a patch exists.
4. If model-execution integration is ever specified, it needs a new ADR and a secure-credential
   design (out of Phase 6, ADR 0040).

Phase 7 has **not** been started.
