# ADR 0039 — Reproducibility model (`reproducibility-v1`)

**Status:** Accepted · 2026-10-03 · Phase 6

## Context

- `08` Phase 6 acceptance: "experiments reproducible and comparable". `05` lists a
  "reproducibility rate". `01` §4 lists "reproducibility notes".
- The prompt requires explicit `reproducible / partial / not reproducible / unknown` states and
  warns: **do not claim reproducibility merely because metadata exists.**

PEOS cannot re-run an experiment (ADR 0040), so it can only report how completely the
reproduction information was recorded — not whether a re-run would match.

## Decision

1. **Per-run classification** over recorded metadata fields
   `model, modelVersion, promptVersion, datasetName, codeRef` (a blank string counts as absent):
   - `reproducible` — all five recorded;
   - `partial` — some recorded;
   - `not_reproducible` — none recorded.
2. **Per-experiment state:** `unknown` when there are no runs; otherwise the **best** run (if any
   run is fully specified the experiment can be reproduced from it, else `partial`, else
   `not_reproducible`).
3. **Honest labelling.** Every explanation ends "Based on recorded metadata only — not a verified
   reproduction." The metric is named "Reproducibility (recorded metadata)" and its caveats say the
   same. This measures the **record**, not the experiment.
4. **Required set rationale.** These five identify the model, its version, the exact prompt, the
   data and the code — the minimum to attempt a re-run. `datasetVersion` and `environment` are
   recorded but not required (not every experiment uses a versioned dataset), to avoid marking
   legitimately dataset-free experiments as irreproducible.
5. The `reproducibilityNote` free-text field complements the classification with the owner's own
   caveats.

## Alternatives considered

- **A reproducibility percentage.** Implies precision the data does not support; the four states
  are honest. Rejected.
- **Counting any metadata as "reproducible".** Exactly what the prompt forbids. Rejected.

## Consequences

`ai.reproducibility_distribution` and the dossier use `reproducibility-v1`. Changing the required
field set needs `reproducibility-v2`.
