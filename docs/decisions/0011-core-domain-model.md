# ADR 0011 — Core domain model, relational integrity and provenance

**Status:** Accepted · 2026-10-02 · Phase 1

## Context

Phase 1 (`08`) builds profile, experiences, skills, technologies, certifications, projects and
evidence, with relationships and import/export. `04_DATA_MODEL.md` lists fields and N:M
relationships but leaves several points open:

- ownership (C1 → ADR 0003)
- enum values
- the shape of provenance
- how to delete
- how to guarantee that relationships never cross users

## Decision

1. **Ownership in every table.** Every entity has a non-null `user_id`. Experience and Education
   are owned through `user_id` rather than `04`'s `profileId`. Profile is 1:1 with User, so the two
   are equivalent, and this keeps one ownership rule across all tables.

2. **Cross-user safety in the database.** Each owned parent has `UNIQUE (id, user_id)`. Each join
   table (`project_skills`, `technology_usages`, `project_evidence`, `skill_evidence`,
   `certification_skills`, `certification_evidence`, `experience_evidence`) carries `user_id` and
   references both parents through **composite FKs `(parent_id, user_id)`**. A row linking user A's
   project to user B's skill is impossible, even if service code is bypassed (integration-tested).

3. **Join attributes from the spec:**
   - `TechnologyUsage.usageType` uses the enum `core | supporting | infrastructure | tooling | other`.
   - `proficiencyEvidence` is free text describing how proficiency was shown.
   - `SkillEvidence.strength` uses the enum `weak | moderate | strong`, plus a `date`.

   `04` names these fields without defining their values. The values chosen are minimal and
   extensible through future enum migrations.

4. **Enums:**
   - Project `status`: the `01` §3 lifecycle (`idea … archived`).
   - Project `healthStatus` (manual until the Phase 3 health score): `not_assessed | on_track |
at_risk | blocked`.
   - Certification `status`: `planned | in_progress | earned | revoked`. Expiry/renewal state is
     **derived** from `expiry_date`, never stored.
   - Evidence `type`: the `01` §10 list (`repository` stands in for "GitHub links").
   - `verified` + `verified_at`, kept consistent by a CHECK.

5. **Normalised keys.** Skill and Technology store `key = lower(trim(name))`, unique per user. This
   gives case-insensitive uniqueness and import duplicate detection. Project `slug` is unique per
   user, CHECK-constrained to kebab-case, and auto-generated (`-2`, `-3`, …) when omitted.

6. **Provenance by reference.** Every importable entity has `origin (manual | import)` and
   `import_record_id → import_records`. The ImportRecord and its ImportJob carry source, file name,
   SHA-256, parser version, importedAt, confidence, reviewedAt and reviewedBy — every field in `11`
   "Provenance". Provenance cannot drift from the import history, and it is not duplicated per table.
   When an import _updates_ an existing manual record, `origin` stays `manual` and
   `import_record_id` points at the latest import applied.

7. **Hard delete with audit.** `04` says _"soft delete only where auditability requires it"_.
   Deletes are hard and cascade to join rows. The audit entry stores the full _before_ snapshot,
   including relationship ids. Import records are never deleted.

8. **Integrity rules in SQL CHECKs:**
   - non-blank names and titles
   - normalised keys
   - slug format
   - date ordering (experience, education, certification, project)
   - skill target level range 0–10 (the level model narrows this further)
   - evidence verification consistency
   - review-queue consistency (accepted ⇔ decision + result; duplicate ⇔ matched id; accepted ⇒ valid)

## Alternatives considered

- _Polymorphic `evidence_links(entity_type, entity_id)`:_ fewer tables, but no foreign keys. `04`
  says to avoid polymorphic relationships.
- _Global technology/skill taxonomy shared across users:_ risks mixing personal data. It can be
  added later as a separate, clearly non-personal reference table.
- _Soft delete everywhere:_ extra filtering on every query with little benefit while the audit
  trail already keeps the before-state.

## Consequences

- Join tables are slightly wider, because they carry `user_id`.
- Adding an owned entity means: `user_id` + `@@unique([id, userId])` + composite FKs on its joins
  - an IDOR test.
