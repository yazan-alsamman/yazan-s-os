# ADR 0023 — Manual health and computed health are independent signals

**Status:** Accepted · 2026-10-03 · Phase 3 · Resolves Phase 2 condition 1

## Context

`Project.healthStatus` has existed since Phase 1 as the user's manual assessment: not assessed,
on track, at risk or blocked. `01` §3 asks for a project health score derived from schedule,
blockers, scope stability, issue severity, recent activity and milestone completion. Phase 2 left
open how the two relate.

## Decision

1. **`healthStatus` stays the manual assessment.** It is never written, overwritten or
   reinterpreted by computation. It remains in the edit form, now labelled "Manual health". The
   Phase 2 Command Center chart is unchanged and says it shows the manual assessment.
2. **Computed health is a separate analytical signal** (model `project-health-v1`, ADR 0024).
   - It is derived on request from persisted data.
   - It is **not persisted**: there are no write triggers and no stale copies. Because of that, it
     has no history, so "declining health" (`00` §4) is unavailable.
   - The computed signal does not read the manual status. In particular, the blockers component
     reads blocked milestones, not `healthStatus = blocked`.
3. **The UI always shows both, labelled.**
   - The dossier header shows "Manual health: …" and "Computed: n/100".
   - The Health section shows them side by side, with the explicit sentence "PEOS never changes
     it".
   - The computed bands use different words: Good / Needs watching / Poor, versus On track /
     At risk / Blocked.
4. **Comparison without a verdict.** The portfolio shows a manual × computed matrix
   (`projects.health_comparison`). It describes agreement and disagreement and declares neither
   signal correct.

## Alternatives considered

- **Replace the manual field with the computed score.** This would destroy user judgement and
  silently change data. Rejected.
- **Default the manual field from the computed band.** This is a silent overwrite by another
  route. Rejected.
- **Persist computed health nightly.** It would allow history, but needs a scheduler, invalidation
  semantics and a migration. It is deferred until a phase needs trends.

## Consequences

Two health signals can disagree, and that is intended and visible. An integration test asserts
that computing intelligence and portfolio analytics leaves `healthStatus` unchanged.
