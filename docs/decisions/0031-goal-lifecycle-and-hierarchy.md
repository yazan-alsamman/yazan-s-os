# ADR 0031 — Goal lifecycle, hierarchy and deletion (`goal-lifecycle-v1`)

**Status:** Accepted · 2026-10-03 · Phase 5

## Context

- **`04` Goal** lists `parentId`, `title`, `type`, `description`, `baseline`, `target`, `metric`,
  `deadline`, `status` and `confidence`, but defines neither the status values nor the types.
- **`01` §8** defines the hierarchy North Star → Annual Objective → Quarterly Goal → Milestone →
  Action, plus an Outcome field and dependencies.
- **`08` Phase 5** schedules the goal hierarchy, milestones, roadmap, dependencies, progress
  metrics and risk states.

Nothing says which transitions are valid, whether levels may be skipped, or what happens to
children when a goal is deleted.

## Decision

1. **Types** are the three goal levels of `01` §8: `north_star`, `annual_objective`,
   `quarterly_goal`. Milestones are the existing project milestones (ADR 0032); Actions/Tasks are
   deferred (no Task entity exists).
2. **Hierarchy.** A parent must be of a **strictly higher** level than its child (levels may be
   skipped: a quarterly goal may sit directly under a North Star). Because the rank strictly
   increases along every path, the hierarchy is **acyclic and at most three levels deep by
   construction** — no recursive cycle check or depth query is needed. Changing a goal's type is
   rejected when its children would no longer be below it. The parent must belong to the same
   user (composite FK; 400 otherwise). A check constraint forbids a goal being its own parent.
3. **Statuses and transitions (`goal-lifecycle-v1`):**

   | From      | Allowed to                    |
   | --------- | ----------------------------- |
   | draft     | active, cancelled             |
   | active    | on_hold, completed, cancelled |
   | on_hold   | active, completed, cancelled  |
   | completed | active (reopen)               |
   | cancelled | draft, active (restore)       |

   Same-status updates are always allowed. New goals start as `draft` unless `active` is given.
   **Open** goals are `active` and `on_hold`; **committed** goals are open or `completed`.

4. **Completion.** `completed ⇔ completedAt` (check constraint). Completing defaults the date to
   today (UTC); past dates are allowed, future dates are rejected; a completion date on a
   non-completed goal is rejected; reopening clears it. Completion is the user's decision and is
   **separate from progress** (ADR 0033): a goal can be completed with any attainment, and an
   attained target does not complete a goal.
5. **Overdue.** An open goal whose deadline is strictly before today (UTC calendar day). Drafts,
   completed and cancelled goals are never overdue.
6. **Deletion.** Refused (409) while the goal has child goals — the user moves or deletes them
   first, so no hierarchy is silently orphaned or cascaded. Deleting unlinks the goal's
   milestones (they stay in their projects) and cascades its own links and measurements. The
   deletion is audited.
7. **Limits.** At most 2,000 goals per user, which also bounds every hierarchy and roadmap query.

## Alternatives considered

- **Cascade-delete children.** Destroys data the user did not select. Rejected.
- **Re-parent children to the grandparent.** Silently changes the hierarchy. Rejected.
- **Free-form hierarchy with a cycle check.** Allows annual objectives under quarterly goals,
  contradicting `01` §8, and needs recursive queries. Rejected.

## Consequences

Lifecycle, overdue and completion are pure functions in `goal.rules.ts`, unit-tested at the UTC
day boundary. A new status or transition requires `goal-lifecycle-v2`.
