# ADR 0024 — Computed health formula v1, delivery rate and missing inputs

**Status:** Accepted · 2026-10-03 · Phase 3

## Context

`01` §3 names six health dimensions and requires a component breakdown: "never show an
unexplained single number". No spec defines the following:

- weights
- thresholds
- scales
- the meaning of "planned milestones"
- how missing inputs are handled

`05` defines Delivery Rate as _completed milestones / planned milestones_ and Scope Stability as
_change in committed scope during a period_. PEOS has no issue tracker, no scope baseline and no
status history.

## Unspecified decisions, and how this ADR resolves them

| Decision                          | Resolution (v1)                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Meaning of "planned milestones"   | Milestones that are completed **or** overdue. Cancelled milestones, milestones not yet due and undated open milestones are neither delivered nor late. |
| Delivery rate with no denominator | `insufficient_data` (or `no_data` when there are no milestones). Never 0% and never a division by zero.                                                |
| Component scale                   | 0–100, mostly using discrete steps (0 / 50 / 100) so that every value has a one-sentence reason.                                                       |
| Weights                           | Equal weights across scored components. The spec gives no basis for anything else.                                                                     |
| Minimum coverage                  | At least 2 scored components for an overall score; otherwise `insufficient_data` and no number.                                                        |
| Bands                             | Score ≥ 75 → Good; 50–74 → Needs watching; < 50 → Poor.                                                                                                |
| Archived projects                 | Not assessed (`not_applicable`).                                                                                                                       |
| Evaluation day                    | Today = UTC calendar day of the request. The result is deterministic per day.                                                                          |

## Components (`project-health-v1`)

| Component            | Inputs                                                             | Rule                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schedule             | `targetDate`, `completedAt`                                        | Completed: 100 if on or before the target, 50 if late. Open: 100 if the target is today or later, 0 if passed. No target → insufficient data.                   |
| Milestone completion | Milestone status and due date                                      | round(100 × delivery rate). Denominator 0 → insufficient data.                                                                                                  |
| Blockers             | Milestone status `blocked`                                         | No open milestones → insufficient data. Any blocked → 0, none → 100. Deliberately conservative.                                                                 |
| Recent activity      | Audit events on the project and its milestones in the last 30 days | Only for active stages (discovery to validation), otherwise not applicable. At least 1 event → 100, none → 0. Presence only: volume is never treated as health. |
| Scope stability      | —                                                                  | **Unavailable.** There is no committed-scope baseline in any spec; reported in every breakdown, never estimated.                                                |
| Issue severity       | —                                                                  | **Unavailable.** There is no issue domain; it needs integrations (Phase 9).                                                                                     |

Overall score = round(mean of the scored components).

Overall status:

- `complete` — all six components scored. This is unreachable in v1 and stated as such.
- `partial` — at least 2 components scored.
- `insufficient_data` — fewer than 2 components scored.
- `not_applicable` — the project is archived.

The response always lists all six components, each with its state, score (or null), explanation
and inputs, plus the overall explanation and the model version.

## Missing-data semantics

A component whose data does not exist is never set to 0, never assumed healthy and never assumed
unhealthy. It takes one of these states:

- **`insufficient_data`** — the project lacks a field that PEOS supports.
- **`not_applicable`** — the component doesn't apply to the project's lifecycle stage.
- **`unavailable`** — PEOS has no data source for it.

Unscored components are excluded from the mean and listed by name.

## Recent activity: the definition

"Project-relevant events" means audit rows with:

- `entity_type = 'project' AND entity_id = project`, **or**
- `entity_type = 'milestone'` with the snapshot's `projectId` equal to the project. This means
  deleted milestones still count.

The same definition drives the dossier activity list (`projectActivityWhere`) and the health count
(`recentEventCounts`, one parameterised `$queryRaw`).

## Alternatives considered

- **Weighted formula (e.g. schedule 30%).** There is no spec basis, and the numbers would only
  look precise.
- **Continuous schedule decay (e.g. −1 per day late).** This is harder to explain in one sentence.
  It can be revisited in v2.
- **Inferring scope changes from the milestone audit log.** This would fabricate a "committed
  scope" concept the spec never defined. Rejected.

## Consequences

The formula is versioned in the metric catalogue (`projects.health_score`,
`projects.health_component.*`). Any change bumps the model version and needs a new ADR. Every
rule and boundary is covered by unit tests in `src/modules/projects/project-health.test.ts`.
