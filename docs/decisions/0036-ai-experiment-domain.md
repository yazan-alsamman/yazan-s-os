# ADR 0036 — AI experiment domain boundaries (AI Lab)

**Status:** Accepted · 2026-10-03 · Phase 6

## Context

- **`01` §4 "AI Engineering Lab"** describes an experiment registry (hypothesis, objective, model,
  version, prompt, dataset, evaluation method, metrics, cost, latency, result, decision,
  reproducibility notes), AI evaluation and run comparison.
- **`04`** models `AIExperiment` (id, projectId, title, hypothesis, objective, model, modelVersion,
  promptVersion, dataset, status, result, decision, cost, latency) and `ExperimentMetric` (id,
  experimentId, name, value, unit, higherIsBetter); relationship **Project 1:N AIExperiment**.
- **`08` Phase 6** builds: experiment registry, experiment metrics, model tracking, comparison,
  cost/latency, evaluation. Acceptance: **experiments reproducible and comparable**.
- **`12_IMPLEMENTATION_GUIDE.md` is absent** (recorded, not fabricated).

The AI Lab is an **engineering experimentation record**, not the AI Copilot (Phase 8) and not a
generic project manager.

## Decision

1. **Scope.** PEOS records, organises, evaluates and compares AI/ML experiments. It does **not**
   execute models or call providers (ADR 0040). The domain is a registry/tracking layer.
2. **Entities** (smallest set that supports comparison, 04 + 01):
   - `AIExperiment` — the registry entry: title, hypothesis, objective, free-text `category`,
     lifecycle `status`, owner `decision`, `result`, `reproducibilityNote`, `startedAt`,
     `completedAt`.
   - `ExperimentRun` — one iteration (ADR 0037); holds the config that varies across runs (04's
     model / modelVersion / promptVersion / dataset) and the measured cost, latency and tokens.
   - `ExperimentMetric` — a recorded evaluation result attached to a run (ADR 0038).
   - `ExperimentEvidence` — experiment ↔ Evidence, reusing the existing Evidence domain.
3. **Project link.** `AIExperiment.projectId` is an **optional** composite FK (04 Project 1:N
   AIExperiment). Optional because a lab experiment need not belong to a project. Deleting a
   project cascades to its experiments (as it does to milestones); project-less experiments are
   unaffected.
4. **Category** is free text (like `Skill.category`); no closed experiment-type taxonomy is
   invented.
5. **Not modelled:** skill/technology direct links (04 does not relate AIExperiment to them —
   deferred; a project reaches skills/technologies), a separate artifact table (artifacts are
   Evidence links or run text refs), and any provider/credential storage (ADR 0040).

## Consequences

Four tables, all owner-scoped by composite FKs. The experiment is the stable registry row; runs
carry the varying, measured detail. Adding skill/technology links later needs only new join tables
and an ADR.
