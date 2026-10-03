# ADR 0046 — Copilot architecture: deterministic routing, controlled tools, evidence-first grounding

**Status:** Accepted · 2026-10-03 · Phase 8

## Context

Phase 8 adds an AI Copilot over the owner's structured records. `06_AI_COPILOT.md` is emphatic:
the Copilot must be a **grounded engineering-intelligence assistant** whose source of truth is the
PEOS data, under the rule "Evidence first. AI second." It must never fabricate PEOS data, AI
results or citations; the model must never receive database access or arbitrary SQL; owner identity
must always come from the session; all retrieved content is untrusted (prompt-injection defence).

## Decision

1. **Deterministic intent router, not model tool-calling.** Server code — not the model — decides
   which of the twelve controlled tools run and with which arguments (`copilot.router.ts`). The
   question text can only select among the fixed tools and a few explicit filters (a quoted search
   term, a time range, boolean flags). It can never name a user, an owner or a raw query. This is
   the primary prompt-injection defence: instructions embedded in a question or in retrieved data
   cannot change which tools run or whose data is read.
2. **Controlled tool layer (exactly twelve tools).** Every tool wraps an existing authoritative
   domain or analytics service (no new metrics, no metric drift), runs as the session user, has a
   strict Zod input schema (unknown keys — including `userId`/`ownerId` — are rejected), and returns
   provenance-tagged `Source` objects. `executeTool` rejects unknown tools and invalid input before
   any database access (ADR 0047).
3. **The model only synthesises.** It receives already-retrieved, redacted context and must answer
   in a strict JSON contract. It has no DB handle, no network tools, and cannot trigger further
   retrieval. A bounded number of tool calls (≤ 4) runs per question.
4. **Evidence-first grounding.** Every statement is classified — `fact` (stated by a record),
   `derived` (an authoritative metric value), `analysis` (the model's interpretation of cited
   records), `unknown` (not in the data) or `assumption` (an unverified user claim). Facts and
   derived values must cite retrieved sources; the citation and number validators drop anything that
   is not supported (ADR 0048). Missing data is reported, never coerced to zero.
5. **Retrieval-only fallback.** When no provider is configured, or the model fails or returns an
   invalid/unsupportable answer, the Copilot returns a deterministic, fully cited answer assembled
   directly from the tool results (ADR 0047). The Copilot is always useful and always honest.
6. **Read-only.** The Copilot performs no autonomous actions. It reads records and writes only its
   own conversation history (ADR 0050). No mutations to domain data are possible through it.

## Consequences

The model is a constrained synthesiser over a trustworthy retrieval layer, not an agent. Hallucination
is contained structurally: injected text cannot pick tools or users, and unsupported claims are
removed before storage or display. The cost is that the Copilot can only answer what the twelve tools
expose; new capabilities require new tools and a new ADR. See [[0047]], [[0048]], [[0049]], [[0050]].
