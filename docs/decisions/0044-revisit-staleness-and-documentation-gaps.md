# ADR 0044 — Revisit, stale critical decisions and documentation gaps

**Status:** Accepted · 2026-10-03 · Phase 7

## Context

- **`04` / `10`:** decisions have a **revisit date**.
- **`00` §4 Critical panel:** "Stale critical decision" — undefined.
- The prompt forbids treating an old decision as stale by age alone and forbids an opaque
  architecture quality/completeness score.

## Decision

1. **Revisit due (`revisit-v1`)** = status `accepted` AND a recorded `revisitDate` strictly before
   today (UTC calendar day). Decisions without a revisit date are never due; proposals, rejected,
   deprecated and superseded decisions are not assessed (they do not govern the architecture).
2. **Stale critical decision** = revisit due AND the decision governs at least one component the
   owner marked **critical** (ADR 0043). Both inputs are recorded facts; nothing is inferred from
   age, technology or project state. The dossier explains why ("Revisit was due on … and the
   decision governs 2 critical components").
3. **Documentation gaps (`documentation-gaps-v1`)** — a **list** of expected parts that are missing,
   never a score. Expected parts come from `10` (alternatives, decision, consequences, project
   relationship), `04` (context) and `00` §5 (evidence):
   `context`, `decision`, `consequences`, `alternatives`, `projects`, `evidence`. Proposals are
   drafts, so `decision` and `consequences` are not expected from them.
4. Missing evidence is shown as missing ("No evidence linked") and counted only by the explicitly
   defined `architecture.decisions_without_evidence`; it never lowers any score.

## Alternatives considered

- **Age thresholds** (e.g. older than 2 years = stale) — rejected: no spec support; an old,
  revisited decision can be perfectly current.
- **A completeness percentage** — rejected: weights between parts would be invented.

## Consequences

`architecture.revisit_due`, `architecture.stale_critical_decisions` and
`architecture.decisions_with_gaps` are catalogued; the Command Center Critical panel lists stale
critical decisions.
