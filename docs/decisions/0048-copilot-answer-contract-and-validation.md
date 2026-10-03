# ADR 0048 — Copilot answer contract, grounding validation and citations

**Status:** Accepted · 2026-10-03 · Phase 8

## Context

`06_AI_COPILOT.md` requires that the Copilot distinguish retrieved facts, derived values, model synthesis, unknowns
and user assumptions; that it never fabricate citations or data; and that a statement which cannot be
supported by the retrieved context is **not silently accepted as fact** (the grounding-failure rule).

## Decision

1. **Strict JSON answer contract (`copilot.grounding.ts`).** The model must return
   `{ statements: [{ text, kind, sources[] }], recommendations?: [...], unavailable?: [...] }`, where
   `kind ∈ {fact, derived, analysis, unknown, assumption}`. The response is parsed and validated with
   Zod; anything that is not valid JSON or breaks the contract is treated as an invalid response and
   triggers the retrieval-only fallback (ADR 0047).
2. **Citation validation.** For each statement, references that were not among the retrieved sources
   are dropped. A `fact` or `derived` statement with **no** surviving citation is removed entirely —
   never downgraded to prose and never kept. A recommendation with no retrieved evidence is removed.
3. **Number validation.** Every number in a `fact`/`derived` statement must appear in the fields of
   the sources it cites (ratios stored 0–1 are also matched against their percentage form). A
   statement with an unsupported number is removed. This blocks fabricated counts, dates and metrics.
4. **Honest relabelling.** A `fact` that cites only metric (derived) sources is relabelled `derived`,
   so the evidence class always matches the actual provenance.
5. **Transparency, never silent edits.** Every removal is surfaced to the user as a grounding notice
   ("Removed N references to records that were not retrieved", "Removed N claims with numbers not
   found in the cited records", …). `analysis`, `unknown` and `assumption` statements are allowed
   without citations, because they are explicitly not claims of recorded fact.
6. **Citations are provenance, not model output.** The displayed citations are built from the
   validated statement/recommendation references against the retrieved `Source` set, carrying each
   source's label, type, origin and drill-down href. The model cannot invent a citation target.
7. **Secret redaction.** Retrieved text is redacted before entering the model context, and the final
   answer is redacted again before storage/display (`copilot.redact.ts`): private keys, common token
   shapes, `key=value` secrets and credentialed database URLs. Pattern-based and best-effort — it
   reduces accidental leakage of secrets pasted into notes; it is not a guarantee.

## Consequences

The stored and rendered answer is always traceable to retrieved records, with claims the model could
not support removed and the removal disclosed. The model can still contribute `analysis` and framing,
but it cannot manufacture facts, numbers or sources. See [[0046]], [[0047]], [[0049]].
