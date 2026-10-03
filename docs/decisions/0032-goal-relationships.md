# ADR 0032 — Goal relationships: projects, skills, milestones, dependencies and measurements

**Status:** Accepted · 2026-10-03 · Phase 5

## Context

- **`04` relationships:** Project N:M Goal; Goal 1:N Milestone (`Milestone.goalId`); Goal 1:N Task.
- **`00` §5:** Goal → Projects, Skills, Milestones, Evidence.
- **`08` Phase 5 acceptance:** "goals connect to projects and skills".
- Phase 3 built project milestones (ADR 0022) and deferred `Milestone.goalId` to Phase 5.
- Phase 4 built evidence-derived skill intelligence (ADRs 0027–0029).

## Decision

1. **Goal ↔ Project** (`goal_projects`): many-to-many "contributes to". Replace-set semantics
   (ADR 0015). The dossier shows each project's lifecycle status and **manual** health; a project
   marked at risk or blocked is a goal risk signal (ADR 0033).
2. **Goal ↔ Skill** (`goal_skills`): many-to-many "requires". The goal **reuses Phase 4 skill
   intelligence unchanged** — the same `analyseSkills` call yields the derived level, the skill's
   own target, gap and freshness, so a goal never shows a different value from the skill
   dossier (integration- and E2E-tested). There is **no per-goal target level and no skill
   importance**: the spec defines neither, so none is invented.
3. **Goal ↔ Milestone** uses the existing `milestones` table with a nullable `goal_id`
   (composite FK with the owner) — **no second milestone system**. A milestone counts toward at
   most one goal (Goal 1:N Milestone), so milestone progress is never double-counted. Linking a
   milestone that already counts toward another goal returns 409; the user unlinks it there
   first. Milestones still belong to their project and keep the Phase 3 lifecycle and overdue
   rule.
4. **Dependencies** (`goal_dependencies`): "goal A depends on goal B". Same owner, not self
   (check constraint), **acyclic** (a bounded BFS that visits each goal once rejects cycles with
   400). A dependency that is cancelled or overdue is a risk signal for the dependent goal.
5. **Measurements** (`goal_measurements`): dated observed values of the goal's metric, needed for
   target attainment and the burndown. Dates cannot be in the future; values are finite; a goal
   needs a baseline and a target before values can be recorded; at most 1,000 per goal. Nothing
   is interpolated or back-filled.
6. **Ownership.** Every link table carries `user_id` with composite FKs to both sides, so a link
   can only join records of the same user even if a service check were missing. Foreign targets
   return 400; foreign goals return 404.
7. **Audit.** Relationship changes are one `goal.relations_updated` event with sorted before and
   after id lists; measurements are `goal_measurement.created` / `.deleted`.

## Deferred

- **Goal ↔ Evidence** (`00` §5, not in `04`): evidence reaches a goal through its projects and
  skills. A direct link would need a decision on how it counts; deferred.
- **Goal ↔ Task / Action:** no Task entity exists.

## Consequences

Phase 5 adds five tables and one nullable column; no Phase 3 or Phase 4 table or rule changes.
