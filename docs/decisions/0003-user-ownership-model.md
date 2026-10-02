# ADR 0003 — Single-user product with enforced per-user ownership

**Status:** Accepted · 2026-10-02

## Context

PEOS is a private personal platform (`00` §1, §2.10). The specifications pull in two directions:

- `07_SECURITY_PRIVACY.md`: _"All resources are scoped to the authenticated user. Never rely
  solely on UI hiding."_ `00` §7 asks for an _"RBAC-ready authorization model"_.
- `04_DATA_MODEL.md` gives `userId` only to `Profile`. `Project`, `Skill`, `Technology`, `Goal`,
  `Evidence` and the others have no owner field.

## Decision

1. **Single personal product, multi-user-safe data layer.** There are no organisations, teams or
   tenants.
2. Every table holding user data gets a **non-null `userId` UUID FK → `users.id`**, indexed and
   usually leading composite indexes (e.g. `@@index([userId, createdAt])`). Uniqueness that is
   per-person is scoped by owner (e.g. `@@unique([userId, slug])`). This supplements `04` and is
   applied in the Phase 1 schema.
3. Shared reference data that holds no personal facts (none exists yet) may be unowned. It must be
   justified in the migration's ADR.
4. Enforcement is server-side at two layers:
   - **Repository:** every read and write for owned entities filters by owner (`ownedBy(userId)`).
     Repositories expose no unscoped lookups.
   - **Service:** `requireResourceOwnership(resource, userId, getOwner)` raises `NOT_FOUND` for
     both missing and foreign records, so an attacker cannot tell "exists but not yours" from
     "does not exist".
5. The authenticated identity comes only from the server-validated session (`requireApiUser`,
   `requireAuthenticatedUser`). It never comes from request parameters.
6. RBAC readiness: authorization decisions go through these primitives, so roles can be added
   later without touching call sites.

## Alternatives considered

- _Single-user without owner columns:_ simplest, but every table would need redesign to add a
  second user (even a read-only reviewer). It also violates `07`.
- _Organisation/tenant model:_ nothing in the specification requires it. Rejected as premature.
- _PostgreSQL Row-Level Security:_ strong, but Prisma's pooled connections need per-request
  session variables, which adds complexity. Reconsider in Phase 12 hardening as defense in depth.

## Consequences

- Phase 1 must add `userId` to every user-data entity in `04` and follow the repository rules above.
- Integration tests prove that a second user cannot read the first user's records by ID
  (`tests/integration/ownership.int.test.ts`). Each new owned entity must add an equivalent test.
- `AuditLog.actorId` is nullable with `ON DELETE SET NULL`, so the audit trail survives deletion of
  the account it refers to.
