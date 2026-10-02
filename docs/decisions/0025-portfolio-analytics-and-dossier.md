# ADR 0025 — Portfolio analytics semantics, technology mapping and the project dossier

**Status:** Accepted · 2026-10-03 · Phase 3

## Context

`08` Phase 3 asks for portfolio charts, technology mapping and project evidence, with the
acceptance target "project detail becomes a complete engineering dossier".

- **`00` §4** requires a project delivery trend and lists "Overdue milestone" as a Critical item.
- **`05`** lists a Project Portfolio Matrix (impact × complexity × effort), a Technology Heatmap
  (technologies × months) and Blocked Time.
- **`01` §3** lists project fields that `04` doesn't define: Users, Business value, Risks and Owner.

## Decision

1. **Point-in-time vs period.**
   - Distributions are point-in-time: lifecycle, manual health, computed health, technology usage,
     evidence coverage, overdue and blocked.
   - Trends are period-based and use recorded dates only. They reuse the Phase 2 period
     architecture: UTC inclusive days, presets 30/90/365 days, all time, and custom ranges of at
     most 20 years.
   - The project delivery trend counts `completedAt`. Milestone completions count
     `Milestone.completedAt`.
   - Nothing is inferred from `updatedAt`, audit time or status.
2. **No lifecycle history.**
   - PEOS stores only the current status. The dossier shows the current stage ("stage n of 8")
     and states that transition history isn't recorded. No previous stages are drawn as
     "passed".
   - Blocked Time and lifecycle durations are catalogued as unavailable.
   - History is never reconstructed retroactively from the audit log.
3. **Drill-down invariant (continues ADR 0020).** Every count metric maps to a list whose total
   equals it.
   - Milestones: the new `/api/v1/milestones` list with filters `status`, `open`, `overdue`,
     `dated`, `projectId`, due and completed ranges.
   - Projects: `technologyId` (existing) and the new `hasEvidence`.
   - Evidence: the new `projectId`.
   - Computed health buckets and manual × computed cells: the new computed-health list
     (`/api/v1/analytics/project-health`).

   Integration tests assert equality for every bucket.

   **Documented exception:** score metrics (`projects.health_score`, components) are explained
   by their component breakdown, not by a list. `projects.delivery_rate` drills to its numerator
   (completed); its denominator adds overdue.

4. **Technology mapping.**
   - The portfolio shows the number of projects per technology, split by usage type: top 15, the
     rest summarised.
   - The dossier shows each technology with its usage type and "also in N other projects",
     linked to the filtered project list.
   - No proficiency score is derived, and Technology ↔ Skill stays Phase 4.
5. **Not built: data does not exist.**
   - **Portfolio Matrix:** `impact` is free text; complexity and effort don't exist.
   - **Technology Heatmap:** usage has no dates.

   Both are listed as unavailable in the catalogue, with "Specification decision required".

6. **Dossier sections.** Overview (identity, lifecycle, schedule, links, provenance) · Health
   (manual vs computed, components) · Delivery (milestone facts, delivery rate, milestone
   management) · Engineering context (technologies, skills) · Evidence (summary, by type,
   timeline, related skills, linked list) · Activity (project-scoped audit).
   - Users, Business value and Risks (in `01`, not in `04`) are not added. `Impact` is shown as
     recorded. This is a specification gap.
   - Architecture decisions and AI experiments are shown as later-phase notes, not as empty fake
     sections.

## Alternatives considered

- **Infer the technology heatmap from project start and completion dates.** Rejected: it
  fabricates usage months.
- **Add numeric impact, complexity and effort fields now.** Rejected: speculative schema without
  a spec definition.
- **Reconstruct status history from audit snapshots.** Rejected: the audit log was not designed
  as a complete history, and projects created by import have no transitions.

## Consequences

Portfolio values are always explainable by a list or a breakdown. The spec owner must decide on
the matrix fields, dated usage, scope baseline and status history before those visualisations can
exist.
