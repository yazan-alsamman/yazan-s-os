# ADR 0035 — Roadmap temporal semantics

**Status:** Accepted · 2026-10-03 · Phase 5

## Context

- **`01` §8** lists roadmap views: Timeline, Quarter board, Goal tree, Dependency graph and
  Progress chart.
- **`04` Goal** has a `deadline` only — no start date.
- Earlier phases fixed "today" as the UTC calendar day (`src/modules/shared/calendar.ts`).
- The rules forbid fabricated roadmap dates and unbounded roadmap queries.

## Decision

1. **Calendar.** Goal dates are date-only values (PostgreSQL `date`). "Today" is the UTC calendar
   day from the injectable clock. Quarters are **UTC calendar quarters** (Jan–Mar = Q1). Fiscal
   years are not supported.
2. **Start date.** An optional `startDate` is added (deadline ≥ start date, check constraint).
   It is the only way a span is drawn: the timeline shows "Starts …" and "Due …" in the quarters
   containing those dates and "In progress" in quarters strictly between them. Without a start
   date only the deadline is shown. **No date is inferred** from milestones, projects or
   creation time.
3. **Window.** `from` / `to` (inclusive UTC days) in the URL; default = the previous quarter
   through the next six quarters; at most 5 years (validated, 400 otherwise) and 40 quarters.
4. **Timeline rows:** goals with a deadline or start date inside the window, plus every overdue
   goal (with "deadline is before the window" when applicable). Capped at 500 rows with an
   explicit "showing the first 500" note.
5. **Undated goals:** open goals without a deadline are listed separately (count + first 50 + a
   link to the full filtered list); they are never placed on an invented date.
6. **Views.**
   - Timeline: a semantic table (goal rows × quarter columns, text in every cell) inside a
     focusable horizontal scroll region, with a sticky goal column — accessible without a canvas.
   - Quarter board: goals grouped by deadline quarter.
   - Goal tree: nested lists from the hierarchy (≤ 3 levels, ADR 0031).
   - Dependencies: a list of "A depends on B" rows. A graph drawing is **not** justified: the
     dependency set is small and the list carries the same information accessibly.
   - Progress chart: per goal, in the dossier (burndown of recorded measurements with baseline
     and target lines and a table alternative).

## Consequences

The roadmap uses one goal analysis and one dependency query regardless of the window. Fiscal
quarters or a Gantt drawing would need a new ADR.
