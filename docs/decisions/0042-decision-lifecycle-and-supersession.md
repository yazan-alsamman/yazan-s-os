# ADR 0042 — Decision lifecycle and supersession (`decision-lifecycle-v1`)

**Status:** Accepted · 2026-10-03 · Phase 7

## Context

`04` and `01` §5 list a decision `status` but define no values. `08` requires "decision history".
The prompt requires that superseded decisions remain part of the architectural history and that
every lifecycle change is audited.

## Decision

1. **States** (the established ADR vocabulary): `proposed`, `accepted`, `rejected`, `deprecated`,
   `superseded`. **In force** = `accepted`.
2. **Transitions:**

   | From       | Allowed to             |
   | ---------- | ---------------------- |
   | proposed   | accepted, rejected     |
   | accepted   | deprecated, superseded |
   | rejected   | proposed (reconsider)  |
   | deprecated | accepted (reinstate)   |
   | superseded | accepted (reinstate)   |

   Same-status updates are allowed; anything else is 400. New records start as `proposed`,
   `accepted` or `rejected` (there is no history yet to supersede or deprecate).

3. **Decision date.** `decidedAt` is required for every state except `proposed` (DB check);
   accepting or rejecting defaults it to today (UTC); future dates are rejected; reconsidering a
   rejected decision clears it.
4. **Supersession.** `superseded ⇔ supersededById` (DB check); never self (DB check). The
   successor must be the owner's, must not be `rejected`, and must not close a cycle (the
   successor's own superseded-by chain is followed, each decision once). Reinstating clears the
   link; the audit log keeps it.
5. **History is never destroyed by a transition.** Superseded, deprecated and rejected decisions
   stay listed (status filter) and fully readable. A decision that supersedes others **cannot be
   deleted** (409) — that would orphan the history; reinstate the older decisions first. The
   dossier's decision history is read from the audit log (real, dated events only; ≤ 100 shown).
6. **Audit verbs:** `created`, `accepted`, `rejected`, `deprecated`, `superseded`, `restored`,
   `updated`, `deleted`, `relations_updated`, all inside the mutation's transaction.

## Consequences

`architecture.decisions_in_force` and `architecture.decisions_by_status` follow these states. A new
state or transition needs `decision-lifecycle-v2`.
