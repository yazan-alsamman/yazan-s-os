# ADR 0040 — No model execution, no fabricated AI results, no secrets

**Status:** Accepted · 2026-10-03 · Phase 6

## Context

PEOS has no AI provider execution infrastructure, and `07_SECURITY_PRIVACY.md` plus the Phase 6
prompt are emphatic: the AI Lab must never fabricate outputs, scores, cost, latency, tokens or
success, and must never store provider secrets.

## Decision

1. **Registry, not executor.** PEOS records experiments the owner ran elsewhere. It does not call
   any model or provider. No execution code, no provider SDK, no API-key field exists in Phase 6.
2. **Every measurement is a user-recorded fact.** Cost, latency, tokens and evaluation metrics are
   entered by the owner; the service and analytics never compute or estimate them. A missing value
   is `null` and renders as "not recorded" — it is **never** coerced to zero (consistent with the
   missing-data rule of earlier phases).
3. **No fabricated data.** No seed experiments, runs, metrics or analytics. An empty AI Lab shows
   explicit empty/no-data states. Test fixtures exist only inside tests on the isolated database.
4. **No opaque scores.** See ADR 0038: evaluation stays per-criterion; adoption is the owner's
   decision; reproducibility measures recorded metadata (ADR 0039).
5. **Secrets.** Experiment and run records hold model names, versions, prompt-version labels,
   dataset names, code refs and notes — **not** API keys, tokens, provider credentials or
   passwords. There is no credential field; if secure configuration is ever needed it must use the
   existing secure-config architecture, not experiment rows. Free-text fields render through React
   (no injection) and CSV export uses the shared formula-injection guard.
6. **Ownership & audit.** Every experiment, run, metric, evidence link, query, analytics summary
   and comparison is owner-scoped by composite FKs and session-derived identity; all mutations are
   audited in their transaction.

## Consequences

The AI Lab is honest about being a record of real engineering work. If execution integration is
ever specified, it requires a new ADR and a secure-credential design; it is out of Phase 6.
