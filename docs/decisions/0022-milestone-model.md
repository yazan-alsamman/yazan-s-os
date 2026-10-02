# ADR 0022 — Milestone model and lifecycle

**Status:** Accepted · 2026-10-03 · Phase 3

## Context

`08` Phase 3 requires milestones. The specs define the model in three places:

- **`04` Milestone:** `id, goalId, projectId, title, dueDate, completedAt, status`.
- **`04` Relationships:** _Goal 1:N Milestone_.
- **`00` §5:** shows Milestones under Project as well as under Goal.

Goals belong to Phase 5, so there is no `goals` table. The spec defines no milestone statuses, no
ordering, no description and no reopen rule.

## Decision

1. **Schema.** `Milestone` has `id`, `userId`, `projectId`, `title`, `dueDate?`, `completedAt?`,
   `status`, `createdAt` and `updatedAt`. That is the smallest set that covers `04`.
   - **`goalId`** is deferred to Phase 5. Adding it later is a nullable column; no placeholder is
     created now.
   - **No description and no position.** They are not in `04`. Milestones are ordered by planned
     date (nulls last), then title.
   - **Ownership.** Every milestone belongs to exactly one project of the same owner. The composite
     foreign key `(project_id, user_id) → projects(id, user_id)` is `ON DELETE CASCADE`, so the
     database itself rejects a milestone under another owner's project. Deleting a project
     deletes its milestones.
   - **Indexes:** `(project_id, due_date)`, `(user_id, status, due_date)` and
     `(user_id, completed_at)`.
   - **Limit.** A project can have at most 500 milestones, which keeps every project query bounded.
2. **Statuses.** `planned`, `in_progress`, `blocked`, `completed` and `cancelled`.
   - `planned`, `in_progress` and `blocked` are open.
   - `blocked` is the smallest real blocker representation (used by health; ADR 0024).
   - `cancelled` keeps the record but removes it from delivery rate, without deleting history.
3. **Invariant.** A milestone is `completed` if and only if `completed_at` is set. The check
   constraint `milestones_completion_chk` enforces this in the database.
   - Completing without a date uses today (UTC).
   - A completion date in the future is rejected.
   - A completion date on a status other than completed is rejected.
   - Reopening (leaving `completed`) clears the date.
   - Every transition is allowed. These rules are pure functions in `milestone.rules.ts` and are
     unit-tested.
4. **Overdue.** A milestone is overdue when all of these hold:
   - it is open;
   - `dueDate < today`, where today is the UTC calendar day;
   - its project is not archived.

   A milestone due today is not overdue. Undated milestones are never overdue. The rule exists
   once as a pure function (`isOverdue`) and once as a Prisma filter (`overdueWhere`). The list,
   the metrics and the health model all use these two, and tests cover both.

5. **Time.** Plan and completion dates are `@db.Date` calendar days. "Today" is the UTC calendar
   day (`src/modules/shared/calendar.ts`). Every service takes an injectable clock.
6. **Deletion and audit.** Deletion is a hard delete, following the PEOS convention. Every mutation
   is audited in the same transaction:
   - `milestone.created`
   - `milestone.updated`
   - `milestone.completed`
   - `milestone.reopened`
   - `milestone.deleted`

   Snapshots contain domain fields only.

## Alternatives considered

- **A milestone belongs to a project or to a goal (polymorphic).** Goals don't exist yet. Every
  current use case is a project milestone.
- **A completion boolean instead of a status.** This can't represent blocked or cancelled work,
  both of which the health model and delivery rate need.
- **A separate blocker/issue model.** This would be speculative. `01` lists blockers as a health
  input, but `04` defines no such entity (ADR 0024).

## Consequences

Milestones are not yet part of the JSON/CSV export and import exchange format; they are deferred
because the exchange schema would need a versioned extension. When Goals arrive in Phase 5, a
nullable `goalId` can link existing milestones without migrating data.
