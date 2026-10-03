# ADR 0041 — Architecture decision record domain

**Status:** Accepted · 2026-10-03 · Phase 7

## Context

- **`04` ArchitectureDecision:** id, projectId, title, context, problem, decision, consequences,
  status, revisitDate. **`04` ArchitectureAlternative:** id, decisionId, name, pros, cons,
  rejectedReason. Relationship **Project 1:N ADR**.
- **`01` §5 ADR Registry:** Context, Problem, Constraints, Options, Decision, Consequences, Revisit
  date, Status, **Related projects** (plural).
- **`00` §5:** Architecture Decision → Project, Alternatives, Decision, Consequences, Evidence.
- **`10` Architecture:** ADR creation, alternatives, decision, consequences, revisit date, project
  relationship, architecture graph.
- **`08` Phase 7:** ADRs, decision history. Acceptance: projects can expose architecture as
  structured knowledge.
- `12_IMPLEMENTATION_GUIDE.md` does not exist (recorded, not fabricated).

## Decision

1. **`ArchitectureDecision`** holds the 04 fields plus **`constraints`** (01 §5), **`decidedAt`**
   (the recorded decision date; needed for the 00 §4 decision timeline and the 08 decision history)
   and **`supersededById`** (ADR 0042). All decision content is documented by the owner — PEOS
   never generates, infers, ranks or recommends decisions.
2. **Alternatives** are the 04 `ArchitectureAlternative` table (01's "Options").
3. **Projects** are linked through **`decision_projects`** (N:M). 01 says "Related projects"
   (plural) while 04 says Project 1:N ADR; a link table covers both, and — decisively — deleting a
   project removes only the link, so architecture history is never destroyed by a project delete.
4. **Evidence** is linked through `architecture_decision_evidence`, reusing the Evidence domain
   (00 §5). There is no second evidence model.
5. **Components** a decision governs are linked through `decision_components` (ADR 0043).
6. **Not modelled:** a numeric ADR identifier, decision ↔ skill, decision ↔ technology and decision
   ↔ AI experiment links (no spec defines them). Technologies relate to decisions only through
   recorded paths (a governed component's technologies), shown as such.
7. **Ownership:** every table carries `user_id` with composite FKs to every parent; foreign targets
   return 400, foreign records 404. ≤ 2,000 decisions per user, ≤ 50 alternatives per decision.

## Consequences

`architecture.decisions` (00 §4 KPI) becomes available. The project dossier shows the decisions
and components explicitly linked to the project (08 acceptance).
