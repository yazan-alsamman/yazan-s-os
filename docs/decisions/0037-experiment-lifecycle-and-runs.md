# ADR 0037 — Experiment lifecycle and runs (`experiment-lifecycle-v1`)

**Status:** Accepted · 2026-10-03 · Phase 6

## Context

- `04` gives `AIExperiment.status` but does not enumerate its values, and places
  `model/modelVersion/promptVersion/dataset/cost/latency` on the experiment.
- `01` §4 and `08` require comparing **runs** ("compare runs side-by-side", "experiments
  comparable"), which a single flat experiment row cannot express.
- The prompt requires distinguishing not-started from completed, failed execution from
  inconclusive results, and forbids equating **completed = successful**.

## Decision

1. **Runs are first-class and append-only** (`ExperimentRun`). Each run is one configuration/
   iteration with its own model, versions, dataset, environment, code ref and **measured** cost,
   latency and tokens. The 04 fields that vary per attempt live on the run, not the experiment, so
   two runs can be compared (ADR 0038). Runs are never overwritten; a run number increments per
   experiment and is not reused after a delete, preserving history. Deleting a run is audited.
2. **Three independent status axes** keep completion separate from success:
   - **Experiment lifecycle `status`** (`experiment-lifecycle-v1`): `planned → active → completed`,
     with `abandoned` reachable from planned/active, `completed → active` (reopen) and
     `abandoned → planned|active` (restore). Same-status updates allowed; other moves 400.
   - **Run execution `status`**: `completed` (ran to the end), `failed` (execution failed),
     `aborted` (stopped). This is "did it run", not "was it good".
   - **Experiment `decision`** (owner's conclusion): `adopt | reject | inconclusive`, or null
     (undecided). Never derived from status. A completed experiment with no decision is **not**
     "successful".
3. **Completion date.** `completed ⇔ completedAt` is resolved in the service: completing defaults
   the date to today (UTC); future dates and a completion date on a non-completed experiment are
   rejected; reopening clears it. `startedAt ≤ completedAt` (DB check).
4. **Audit verbs** reflect the transition: `completed`, `reopened`, `abandoned`, else `updated`.
5. **Bounds:** ≤ 2,000 experiments per user, ≤ 500 runs per experiment, ≤ 100 metrics per run.

## Alternatives considered

- **Keep config/measures on the experiment (04 literal).** Cannot represent multiple runs, so
  comparison — a Phase 6 acceptance criterion — would be impossible. Rejected.
- **A single `success` flag.** Conflates the owner's judgement with execution and lifecycle.
  Rejected in favour of the three explicit axes.

## Consequences

`ai.active_experiments`, `ai.completed_experiments`, `ai.abandoned_experiments`,
`ai.experiments_by_status` and `ai.experiments_by_decision` follow these definitions. A new status
or transition needs `experiment-lifecycle-v2`.
