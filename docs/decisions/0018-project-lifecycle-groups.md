# ADR 0018 — Project lifecycle groups ("active" and "production")

**Status:** Accepted · 2026-10-02 · Phase 2

## Context

`00` §4 names the KPIs _Active Projects_ and _Production Systems_ without defining them.
`ProjectStatus` has eight values (`01` §3 lifecycle): `idea`, `discovery`, `architecture`,
`development`, `validation`, `production`, `maintenance` and `archived`. A KPI and the list it drills into must share
one definition, or the totals won't match.

## Decision

`src/modules/projects/project.lifecycle.ts` defines two groups. Both the dashboard calculators and
the `lifecycle` filter on `GET /api/v1/projects` use them.

| Group        | Statuses                                                 | Excluded and why                                                                         |
| ------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `active`     | `discovery`, `architecture`, `development`, `validation` | `idea` (no work committed yet), `archived`, and the live states counted under production |
| `production` | `production`, `maintenance`                              | —                                                                                        |

_Projects completed_ counts projects whose `completedAt` falls in the period. Status is not used,
because a completed project can later move to `maintenance`.

## Alternatives considered

- **Treat everything that isn't archived as active.** This would count ideas and live
  production systems as "active", which inflates the number and double-counts production.
- **Let the user configure the groups.** There's no spec basis for this yet. It would also make the
  number mean different things over time.

## Consequences

The groups are documented in the metric catalogue (formula and caveats). Changing them is a
catalogue version bump plus a new ADR. Phase 3 (project intelligence) may refine them.
