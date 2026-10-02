# ADR 0013 — Skill level model

**Status:** Accepted · 2026-10-02 · Phase 1

## Context

- `01` §6 defines the default levels: 0 Not evaluated, 1 Awareness, 2 Working knowledge,
  3 Independent, 4 Advanced, 5 Expert / can lead. It adds _"Levels must be customizable."_
- `04` Skill has `levelModel` and `targetLevel`, and no current level.
- `00` §2.1 says _"Evidence over self-assessment"_.
- `08` schedules "skill levels" and skill gap analysis for **Phase 4**.

## Decision

- `skills.level_model` is a level-model identifier (default `peos-default-v1`), resolved through a
  registry in `src/modules/skills/level-models.ts`. Phase 1 ships only the specification default.
- `skills.target_level` (nullable) is validated against the skill's level model in both the schema
  and the service. The DB CHECK bounds it generically to 0–10.
- **No stored "current level".** The current level will be _derived from evidence_ in Phase 4. The
  UI states this explicitly instead of offering a self-assessment field.
- `category` is free text per user, which makes it configurable by construction (`01` §2: _"The
  exact categories must be configurable"_).

## Alternatives considered

- _SkillLevelModel and SkillLevel tables now:_ this would create schema and UI for a Phase 4
  feature with no consumer yet. When Phase 4 adds user-defined models, it introduces those tables
  and registers their ids; the `skills` table does not change.
- _Self-assessed current level:_ contradicts `00` §2.1.

## Consequences

Phase 4 must provide a custom level-model store and the evidence-derived level computation.
