# ADR 0026 — Customisable skill level models

**Status:** Accepted · 2026-10-03 · Phase 4 · Completes ADR 0013

## Context

`01` §6 defines the default scale and says "Levels must be customizable". `10` asks for a
"Configurable level model". ADR 0013 deferred the custom-model store to Phase 4.

The specs don't say what "customizable" means. It could mean renaming levels, adding levels, or
changing the number of levels. Phase 4 derives levels from evidence (ADR 0027), and every
derivation rule is defined per canonical level value.

## Decision

1. **Custom models rename and describe the canonical ordered values 0–5.**
   - The values themselves are fixed: exactly six levels, `0, 1, 2, 3, 4, 5`, in order.
   - Malformed scales can't exist: no wrong count, no gaps, no duplicates, no reordering. Zod
     validates this, and a CHECK constraint (`jsonb_array_length(levels) = 6`) enforces it.
2. **Storage.**
   - Table `skill_level_models (id, user_id, name, levels jsonb, timestamps)`.
   - Unique `(user_id, name)` and `(id, user_id)`.
   - Name CHECK: 1–80 characters, not blank.
   - At most 20 models per user.
3. **Skill reference.** `skills.level_model` keeps its meaning as the model identifier:
   - `"peos-default-v1"` — the default model;
   - `"custom"` — together with the new `skills.level_model_id`.

   Safeguards:
   - CHECK `skills_level_model_chk`: the value is one of the two, and `custom` ⇔ `level_model_id`
     is set.
   - Composite FK `(level_model_id, user_id) → skill_level_models(id, user_id)`, so a skill can
     never use another user's model. It is `ON DELETE NO ACTION`, which allows account deletion to
     cascade.
   - The service refuses to delete a model that skills still use (409).

4. **Derivation is unaffected.** A custom model changes labels and descriptions only.
   `skill-level-v1` rules stay attached to the values, so level 4 always means the same evidence.
   The default model's descriptions are the evidence rules themselves.
5. **Semantics of special values:**
   - **Level 0 ("Not evaluated")** is never derived. Missing evidence is "Not enough evidence"
     (`null`).
   - **Target 0** means "not evaluated" and counts as no target in gap analysis.
   - **Maximum level** is 5. The DB CHECK on `target_level` stays generically 0–10 (Phase 1).
   - **Ordering:** a higher value means more demonstrated capability.
   - No normalisation is needed, because every model shares the values.
6. **Audit.** `skill_level_model.created`, `.updated` and `.deleted` are written in the same
   transaction. Assigning a model to a skill is a `skill.updated`.

## Alternatives considered

- **Arbitrary N-level scales with per-level evidence rules.** This would be a generic rules
  engine with no specification basis. Rejected as speculative.
- **Proportional mapping of derived levels onto N levels** (e.g. 3/5 → 6/10). This creates false
  precision. Rejected.
- **Separate `skill_levels` rows per model.** That means more tables for a fixed set of six rows.
  JSON with a strict validator and a CHECK constraint is sufficient.

## Consequences

Users can adopt their own vocabulary without changing what the evidence supports. If the
specification later requires a different number of levels, it needs a new derivation-rules ADR
and model version.

The JSON/CSV exchange format does not yet carry custom models. A skill on a custom model exports
`levelModel: "custom"`, and re-importing it is rejected in the review queue. This is deferred to
an exchange-format extension.
