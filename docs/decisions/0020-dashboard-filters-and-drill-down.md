# ADR 0020 — Command Center filters and drill-down

**Status:** Accepted · 2026-10-02 · Phase 2

## Context

`02` requires every widget to drill down to the underlying records, and filters to be visible.
A drill-down is only trustworthy if the list it opens contains exactly the records the number
counted.

## Decision

1. **Filters live in the URL.** The filters are `range`, `from`, `to`, `projectStatus`,
   `projectHealth`, `evidenceType`, `evidenceVerified`, `evidenceOrigin` and `skillCategory`.
   - They are validated server-side by `dashboardFiltersSchema`. Unknown values return 400. A
     custom range needs both dates, in order, spanning at most 20 years.
   - The schema has no identity parameter, and unknown keys (`userId`, `ownerId` and so on) are
     stripped.
   - Each widget lists the filters that narrowed it ("Filtered" badge and meta line). Filters that
     don't apply to a widget are not applied to it.
2. **Drill-down reproduces the formula.** Each KPI and bucket maps to a list URL whose filters
   reproduce the calculation (`src/components/command-center/drilldown.ts`). The list endpoints
   gained backwards-compatible filters for this:
   - Projects: `lifecycle` (ADR 0018), `completedFrom` and `completedTo`.
   - Evidence: `dated`.
   - Skills: `hasEvidence`.
   - Certifications: `current` (excludes revoked, matching the expiry metrics).

   An integration test asserts that the KPI value equals the drilled list's total for every KPI.

3. **Buckets that can't be expressed as a filter don't link.** Examples are "Other categories"
   and "Uncategorised" skills. These rows render without a link rather than with a wrong one.
4. **Lists show the extra filters.** Lists display drill-down parameters as removable "Also
   filtered by" chips, so the user can see why the list is narrowed.

## Alternatives considered

- **Drill to an unfiltered list.** Rejected: the totals wouldn't match the number.
- **A drill-down modal with its own query.** This would duplicate list logic and lose
  shareable URLs.

## Consequences

Any change to a formula must update the drill-down mapping and the equality test, or the test
fails.
