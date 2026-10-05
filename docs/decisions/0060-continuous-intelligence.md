# ADR 0060 — Continuous Intelligence: deterministic signals, grounded generators, human-in-the-loop

**Status:** Accepted · 2026-10-05 · Phase 13

## Context

Phase 13 adds the Continuous Intelligence layer on top of the production-hardened system: automatic
evidence extraction, project retrospectives, skill-decay alerts, opportunity intelligence, learning
plans and a weekly executive review. The master principle (06, 07) is emphatic: **AI is an analyst,
not the source of truth**, and every output must be grounded in real persisted data with provenance.
The environment also has no live AI provider to verify against.

## Decision

1. **Detection is deterministic, not AI.** All signals are produced by pure, versioned rules
   (`intelligence.rules.ts`, `intel-v1`) over already-aggregated real facts (skill freshness reuses
   Phase 4 `freshness-v1`; opportunity gaps reuse the Phase 10 transparent fit). No model call is on
   the detection path. This makes intelligence explainable, testable, cost-free and injection-proof by
   construction. **AI narration of these grounded results is an optional future enhancement and is
   explicitly deferred** — it would only rephrase data the deterministic layer already computed, never
   originate facts.

2. **A persisted signal model with lifecycle + idempotency.** `IntelligenceSignal` carries type,
   severity, status (`active→reviewed/dismissed/resolved`), `sourceType`/`sourceId` + `metadata`
   provenance, and a `dedupeKey` unique per `(userId, condition)`. Re-running detection updates an
   existing signal rather than duplicating it; a condition that no longer holds is auto-resolved; a
   user-**dismissed** signal is respected (never resurrected). Severity never reaches `critical` from a
   weak signal — absence of recent _evidence_ is reported as such, never as "skill lost".

3. **Automatic evidence extraction produces candidates, never authoritative facts.**
   `EvidenceCandidate` is derived only from explicit GitHub artifacts already synchronized — published
   releases and merged PRs (never raw commits) — deduplicated by `(userId, sourceType, sourceId)`.
   Candidates require review; accepting one creates an **unverified** `Evidence` row with GitHub
   provenance; rejecting records the decision so it is not re-suggested. Extraction records only what
   the source states — it never infers business/production outcomes.

4. **Retrospectives and learning plans are grounded, on-demand generators.** They are computed from
   real records and returned live (not persisted), so stale prose can never masquerade as current
   state (spec §13). Every retrospective line is labelled `observed` / `inferred` / `recommended`;
   learning-plan items cite the skill/opportunity records that justify them and name the evidence that
   would close the gap. `WeeklyReview` is the one persisted generator — idempotent per `(userId, ISO
week)`, with explicit data-coverage caveats (a stale GitHub sync marks the week `partial`).

5. **Human-in-the-loop, owner-scoped, auditable.** Intelligence recommends; it never autonomously
   performs consequential actions. All reads/writes are owner-scoped (verified by the integration
   suite); candidate accept/reject, signal dismiss/review, and run/weekly generation are audited.
   Untrusted source text (commit/PR/opportunity text) is only ever stored and displayed as escaped
   data — it is never interpreted as an instruction (no AI on that path).

6. **Scheduling reuses the existing queue, triggered manually now.** The orchestrator (`run`) and the
   weekly generator are idempotent and designed to be driven on a schedule by the existing BullMQ
   infrastructure; Phase 13 exposes them via an owner-triggered, rate-limited `POST /run` and a
   generate-on-read weekly endpoint. Wiring a periodic worker is a deployment step (documented in
   MONITORING.md), deferred rather than faked.

## Consequences

PEOS continuously answers "what changed, why it matters, what evidence supports it, and what to do
next" with fully traceable, deterministic signals and grounded generators — no fabricated intelligence,
no autonomous action. Deferred (documented, not faked): AI narration of grounded results, a live
periodic scheduler/worker, and opportunity change-detection from unsupported external sources. See
[[0056-evidence-vault-and-opportunities]], [[0028-skill-freshness-and-trend]] if present,
[[0019-metric-catalogue-and-result-contract]].
