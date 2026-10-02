# PEOS Phase 1 — Core Data Platform Report

| Field            | Value                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| Date             | 2026-10-02                                                                              |
| Phase definition | `08_IMPLEMENTATION_PHASES.md` → _Phase 1 — Core Data Platform_                          |
| Baseline         | Phase 0 foundation (`ba368d5`, `3c5ad82`)                                               |
| Plan             | `docs/plans/PHASE_01_IMPLEMENTATION_PLAN.md` (written before implementation)            |
| Commits          | `9762d4c` (schema, services, API, import/export) · Phase 1 UI/docs commit (this report) |

## 1. Executive Summary

PEOS now has a real, user-owned core data platform:

- **Domains:** profile, experience, education, skills, technologies, certifications, projects and
  evidence.
- **Relationships:** every one required by `04`, with navigation in both directions.
- **Data features:** user-scoped search, filtering and pagination; an import pipeline (PEOS JSON,
  entity CSV, LinkedIn CSVs) with a mandatory review queue, duplicate detection,
  diff + recommendation and full provenance; JSON/CSV export that round-trips through import.
- **Database:** PostgreSQL via one deterministic migration (17 tables, 15 enums, 26 CHECK
  constraints, 15 composite ownership FKs).
- **Access:** a `/api/v1` REST surface of 29 Phase 1 route files, and management UI for every
  domain.

Ownership is enforced in three layers:

1. session-derived identity
2. owner-scoped repositories
3. **composite foreign keys**, so the database itself rejects cross-user links

An HTTP-level IDOR matrix proves this. No personal data was fabricated: the development database
contains 0 records.

**Validation:**

| Check                     | Result                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Lint / typecheck / format | 0 problems                                                                          |
| Unit tests                | 116/116                                                                             |
| Integration tests         | 56/56 (real PostgreSQL + Redis)                                                     |
| E2E tests                 | 18/18, with 11 axe WCAG 2.x AA scans and 0 violations                               |
| Build                     | Clean                                                                               |
| Dependency audit          | 0 vulnerabilities                                                                   |
| Migrations                | Applied from zero to a fresh database, then the full integration suite passed on it |

**Phase 2 readiness: READY WITH CONDITIONS** (§21).

## 2. Scope Implemented

| Spec item (`08` Phase 1) | Delivered                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile                  | ✔ identity (User: name, timezone, locale) + Profile (headline, summary, location, website, professional objective); created on first save                                  |
| Experiences              | ✔ CRUD, achievements, evidence links, detail page                                                                                                                          |
| Education                | ✔ new entity (ADR 0012), CRUD, import/export                                                                                                                               |
| Skills                   | ✔ CRUD, category, target level against the spec level model (ADR 0013), active flag, evidence links with strength/date, detail page                                        |
| Technologies             | ✔ CRUD, version, notes, project usages with usage type, detail page                                                                                                        |
| Certifications           | ✔ CRUD incl. `category` (from `01`), derived expiry state, related skills, evidence, detail page                                                                           |
| Projects                 | ✔ CRUD, lifecycle status, manual health, slug, URLs, skills/technologies/evidence, detail page                                                                             |
| Evidence                 | ✔ CRUD, `01` §10 types, verified + verifiedAt, structured provenance, reverse navigation, detail page                                                                      |
| CRUD                     | ✔ every entity: create, read, list, update, delete (archive = project status `archived`)                                                                                   |
| Search                   | ✔ per-list `q` and global `/api/v1/search`; command palette search                                                                                                         |
| Relationships            | ✔ Project↔Skill, Project↔Technology (TechnologyUsage), Project↔Evidence, Skill↔Evidence (strength, date), Certification↔Skill, Certification↔Evidence, Experience↔Evidence |
| Import/export            | ✔ review queue, conflicts, provenance; JSON + CSV export; machine-readable exchange JSON Schema + empty seed template                                                      |

Out of scope, by `08` and ADR 0017: Command Center, analytics, goals, milestones, learning
items/Knowledge, AI Lab, architecture, Copilot, opportunities and file uploads.

## 3. Final Domain Model

Details: `docs/architecture/domain-model.md` (ER diagram).

```text
User 1─1 Profile
User 1─N Experience ─N:M─ Evidence            (experience_evidence)
User 1─N Education
User 1─N Skill ─N:M─ Evidence                 (skill_evidence: strength, date)
User 1─N Technology
User 1─N Certification ─N:M─ Skill            (certification_skills)
                      └─N:M─ Evidence         (certification_evidence)
User 1─N Project ─N:M─ Skill                  (project_skills)
                ├─N:M─ Technology             (technology_usages: usage_type, proficiency_evidence)
                └─N:M─ Evidence               (project_evidence)
User 1─N Evidence
User 1─N ImportJob 1─N ImportRecord ─provenance→ every importable entity (origin, import_record_id)
```

## 4. Database Schema

**Migrations** (deterministic, committed):

1. `20261002163936_init_identity_audit` (Phase 0).
2. **`20261002181916_core_data_platform`** (Phase 1). It contains:
   - 17 `CREATE TABLE` (8 entities, 7 joins, 2 queue tables) and 15 enums
   - 40 indexes, 12 of them unique
   - 33 foreign keys, 15 of them composite `(parent_id, user_id)`
   - 26 CHECK constraints

**Tables, ownership fields and uniques:**

| Table          | Ownership                                 | Uniques                          |
| -------------- | ----------------------------------------- | -------------------------------- |
| profiles       | `user_id` UNIQUE (1:1)                    | `user_id`                        |
| experiences    | `user_id`                                 | `(id,user_id)`                   |
| education      | `user_id`                                 | —                                |
| skills         | `user_id`                                 | `(id,user_id)`, `(user_id,key)`  |
| technologies   | `user_id`                                 | `(id,user_id)`, `(user_id,key)`  |
| certifications | `user_id`                                 | `(id,user_id)`                   |
| projects       | `user_id`                                 | `(id,user_id)`, `(user_id,slug)` |
| evidence       | `user_id`                                 | `(id,user_id)`                   |
| 7 join tables  | `user_id` + composite FKs to both parents | composite PK                     |
| import_jobs    | `user_id`                                 | `(id,user_id)`                   |
| import_records | `user_id`, composite FK to job            | `(id,user_id)`                   |

**CHECK constraints:**

- non-blank names and titles (9)
- normalised `key` (2)
- slug format/length
- date order (5)
- target level range; level model not blank
- `verified` ⇔ `verified_at`
- review-queue consistency (4)
- import job counts and SHA-256 format (2)

**Conventions:** UUID ids; `created_at`/`updated_at timestamptz(3)`; snake_case names; hard delete
plus an audit "before" snapshot (ADR 0011).

**Verification:**

- `prisma migrate diff --exit-code` reports no drift.
- Both migrations were applied to a brand-new database (`peos_fresh`) and all 56 integration tests
  passed against it; the database was then dropped.

## 5. API Surface

Full table: `docs/architecture/api.md`.

**Common to every endpoint** (ADR 0015):

- **Authentication:** session required (401 otherwise).
- **Ownership:** the session user only. A foreign id is treated as missing: 404 for items, 400 for
  relationship targets.
- **Validation:** Zod on every body and query, a 256 KiB JSON cap, and UUID path ids.
- **CSRF:** Origin check on mutations (403).
- **Rate limits:** mutations 120/min, imports 20/hour, export 30/hour.

| Method(s)            | Path                                                          | Purpose                                        |
| -------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| GET · PATCH          | `/api/v1/profile`                                             | Own profile (upsert)                           |
| GET · POST           | `/api/v1/experiences`                                         | List / create                                  |
| GET · PATCH · DELETE | `/api/v1/experiences/:id`                                     | Detail / update / delete                       |
| PUT                  | `/api/v1/experiences/:id/evidence`                            | Replace evidence links                         |
| GET · POST           | `/api/v1/education`                                           | List / create                                  |
| GET · PATCH · DELETE | `/api/v1/education/:id`                                       | Detail / update / delete                       |
| GET · POST           | `/api/v1/skills`                                              | List / create                                  |
| GET                  | `/api/v1/skills/categories`                                   | Categories + level models                      |
| GET · PATCH · DELETE | `/api/v1/skills/:id`                                          | Detail / update / delete                       |
| PUT                  | `/api/v1/skills/:id/evidence`                                 | Replace evidence links (strength, date)        |
| GET · POST           | `/api/v1/technologies`                                        | List / create                                  |
| GET · PATCH · DELETE | `/api/v1/technologies/:id`                                    | Detail / update / delete                       |
| GET · POST           | `/api/v1/certifications`                                      | List / create                                  |
| GET · PATCH · DELETE | `/api/v1/certifications/:id`                                  | Detail / update / delete                       |
| PUT                  | `/api/v1/certifications/:id/skills`                           | Replace related skills                         |
| PUT                  | `/api/v1/certifications/:id/evidence`                         | Replace evidence                               |
| GET · POST           | `/api/v1/projects`                                            | List / create (with relationships, atomically) |
| GET · PATCH · DELETE | `/api/v1/projects/:id`                                        | Detail / update / delete                       |
| PUT                  | `/api/v1/projects/:id/skills` · `/technologies` · `/evidence` | Replace relationships                          |
| GET · POST           | `/api/v1/evidence`                                            | List / create                                  |
| GET · PATCH · DELETE | `/api/v1/evidence/:id`                                        | Detail (reverse links) / update / delete       |
| GET                  | `/api/v1/search`                                              | Grouped or per-type paginated search           |
| GET · POST           | `/api/v1/imports`                                             | Import jobs / upload (multipart)               |
| GET                  | `/api/v1/imports/:id`                                         | Job + paginated review queue with diffs        |
| POST                 | `/api/v1/imports/:id/records/:recordId/decision`              | Accept (create/update) or reject               |
| POST                 | `/api/v1/imports/:id/resolve`                                 | Bulk accept new valid / reject pending         |
| GET                  | `/api/v1/export`                                              | JSON (all) or CSV (one entity) download        |

## 6. UI Surface

Pages, in the specified navigation (ADR 0016):

| Section             | Pages                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Career Intelligence | Profile (`/career/profile`); Experience (list, detail); Education (list)                                                    |
| Projects            | `/projects` (list); `/projects/[id]` (detail with skills, technologies, evidence, metadata, provenance)                     |
| Skills              | `/skills` (list) and `/skills/[id]` (detail: evidence with strength, projects, certifications); Technologies (list, detail) |
| Certifications      | list and detail (related skills, evidence)                                                                                  |
| Evidence Vault      | list and detail (projects, skills, certifications, experience)                                                              |
| Settings            | Account · Import (upload + history) · Import review (`/settings/import/[id]`) · Export                                      |

Shared components:

- **`ResourceList`:**
  - URL-synced search, filters, sort and pagination
  - a table on desktop and cards on mobile
  - loading skeleton, a distinct empty state ("No projects yet.") and a filtered-empty state
  - error with retry
  - row actions; create/edit dialogs; delete confirmation
- **`EntityForm`:** React Hook Form + Zod for client feedback, with server field errors mapped
  back onto the inputs.
- **Detail parts:** `RelationPanel` and `RelationPicker` (accessible checklist with a per-link
  attribute), `ProvenancePanel`, and `ExternalLink` (http(s) only, `noopener noreferrer nofollow`).
- **Command palette:** live record search plus commands for every Phase 1 page.

## 7. Import System

Details: ADR 0014 and `docs/architecture/import-export.md`.

- **Formats:**
  - PEOS exchange JSON (`peos-json@1`); JSON Schema at `data/peos-exchange.schema.json`, empty
    template at `data/profile.seed.json`
  - entity CSV (`peos-csv@1`)
  - LinkedIn data-export CSVs (`linkedin-csv@1`): Profile, Positions, Education, Certifications,
    Projects, Skills
- **Parsing:**
  - own RFC 4180 CSV parser (quotes, CRLF, BOM, row/column/cell limits)
  - strict top-level JSON schema
  - LinkedIn files recognised by header, preamble lines skipped
- **Normalisation:** trims values, drops empties, and converts dates (`YYYY-MM`, `Mar 2024`, …) to
  `YYYY-MM-DD`. Ambiguous `dd/mm/yyyy` is rejected, not guessed.
- **Validation:** the same domain Zod schemas as manual entry. Invalid records are listed with
  per-field errors and cannot be accepted.
- **Review queue:** `import_jobs` + `import_records`, each record carrying:
  - entity type and source reference
  - the normalised payload
  - validation status and errors
  - confidence
  - match status and matched id
  - review status, decision, result id
  - reviewer and review time
  - notes
- **Conflicts:** natural-key duplicate detection, recomputed at decision time. The review shows a
  field diff (existing vs imported) and a recommendation (_reject_ if identical, else _update_).
  The user chooses **update existing**, **create as new** (refused where uniqueness forbids it) or
  **reject**. Nothing is overwritten silently.
- **Bulk actions:** "accept all new valid" works in dependency order; duplicates stay pending.
  "Reject all pending" is also available.
- **Provenance:** accepted records get `origin=import` and `import_record_id`. The UI shows source,
  file, source ref, parser, importedAt, confidence and reviewer.
- **Persistence:** one transaction per decision. Relationships are resolved by name against
  existing records; unresolved names become notes and are never auto-created.
- **Safety:** 2 MiB cap before buffering; extension and MIME allow-list; strict UTF-8; NUL bytes
  rejected; at most 2,000 records; never executed; the original file is not stored (SHA-256 only);
  20 uploads per hour.

## 8. Export System

- **JSON:** the full exchange document with relationships by name and provenance for every record.
  It is re-importable, and re-importing it yields only duplicates with a "reject" recommendation
  (tested).
- **CSV:** one table per entity, using the importer's column names.
- **Security:**
  - every query is scoped to the session user
  - generated on request and never stored; no public URL
  - `Content-Disposition: attachment`, `no-store`
  - spreadsheet formula injection neutralised
  - deterministic ordering (identical output for the same timestamp; tested)
  - audited (`export.generated`)
  - 30 exports per hour

## 9. Search & Filtering

- **Matching:** each list's `q` uses a case-insensitive substring match on that entity's text
  fields. LIKE wildcards are escaped explicitly, because Prisma `contains` does **not** escape
  `%`/`_` (verified empirically, then integration-tested).
- **Global search:** `/api/v1/search` returns the top N per type (N ≤ 20), or a paginated list
  for one type.
- **Filters:**

  | Entity         | Filters                                                                         |
  | -------------- | ------------------------------------------------------------------------------- |
  | Projects       | status, health, skill, technology, start-date range, imported                   |
  | Skills         | category, active, has target                                                    |
  | Technologies   | category                                                                        |
  | Certifications | status, issuer, expiry state (valid / expiring within 90 days / expired / none) |
  | Evidence       | type, verified, provenance (origin), date range                                 |
  | Experience     | current                                                                         |

- **Sorting:** whitelisted fields, with `id` as a tie-breaker.
- **Pagination:** offset paging, default 20, maximum 100.
- **Not used:** pgvector (Phase 8) and trigram indexes; neither is needed at personal data scale
  (§14).

## 10. Authorization & User Isolation

- **Identity:** always from the server session (`requireApiUser`), never from input.
- **Repositories:** every read and write includes `userId`; there are no unscoped lookups.
- **Services:** relationship targets are counted under the owner filter. Any missing or foreign id
  produces an indistinguishable 400.
- **Database:** composite FKs `(parent_id, user_id)` on all 7 join tables, plus import records →
  jobs.

Test coverage:

| Test file                                                                              | What it proves                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/idor.int.test.ts` (13 tests, real HTTP handlers, two real sessions) | GET/PATCH/DELETE on another user's record for 7 entity types → 404 with the record unchanged; 7 relationship endpoints → 404; injecting another user's ids into one's own project → 400; lists, search, profile and export never contain foreign data; unauthenticated → 401; cross-origin mutation → 403; malformed ids/bodies → 404/400/415, never 500 |
| `tests/integration/relationships.int.test.ts`                                          | Composite FKs reject cross-user links with the service bypassed; a foreign id rolls back the whole create                                                                                                                                                                                                                                                |
| `tests/integration/import-export.int.test.ts`                                          | Another user's import job, records, decisions and bulk actions → NOT_FOUND                                                                                                                                                                                                                                                                               |
| `tests/integration/ownership.int.test.ts` (Phase 0)                                    | Ownership primitives                                                                                                                                                                                                                                                                                                                                     |

## 11. Audit Logging

Every Phase 1 mutation writes its audit entry **inside the same transaction** (`auditInTx`). Each
entry records actor, action, entity type, entity id, request id, timestamp and before/after domain
snapshots. Credentials and tokens are never included.

| Actions                                                                                                    | Recorded when                                                 |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `profile.created` / `profile.updated`                                                                      | Profile is saved                                              |
| `{experience, education, skill, technology, certification, project, evidence}.{created, updated, deleted}` | Any entity changes; deletes include the relationship ids      |
| `*.relations_updated`                                                                                      | A relationship set changes; before/after id sets are recorded |
| `import_job.uploaded`                                                                                      | A file is uploaded (source, file name, SHA-256, counts)       |
| `import_record.accepted` / `import_record.rejected`                                                        | A review decision is made                                     |
| `export.generated`                                                                                         | An export is produced (format, counts)                        |

## 12. Testing

```text
Unit:           116 tests / 15 files (validators, CSV, normalisation, 3 parsers, candidate validation,
                diff, natural keys, JSON Schema sync, pagination/sort, origin check, body limits,
                DB error mapping, LIKE escaping, level model, expiry state, env incl. rate-limit guard)
Integration:    56 tests / 8 files on real PostgreSQL 17 + Redis 8 (Phase 1: CRUD 6,
                relationships 7, IDOR 13, import/export/search 9)
Authorization:  21 — IDOR HTTP matrix 13 + ownership 5 + composite-FK/rollback 2 + import cross-user 1
E2E:            18 Playwright tests (Phase 1: 10 — empty states, profile, project + relationships,
                skill evidence, certification links, search/filters/palette, import→review→accept,
                export scoping, delete confirmation, mobile)
Accessibility:  11 axe scans (wcag2a/aa, wcag21a/aa, wcag22aa) across sign-in, shell, lists,
                detail pages, dialogs, import review, mobile — 0 violations
Import:         unit 21 (parsers, CSV, normalisation, validation, schema) + integration 6 + E2E 1
Export:         integration 2 (+ export assertions in the IDOR suite) + CSV unit tests + E2E 1
```

Coverage percentages were not collected; no threshold is configured yet.

## 13. Validation

```text
Lint:                 PASS — eslint . --max-warnings=0 (0 errors, 0 warnings)
Typecheck:            PASS — next typegen && tsc --noEmit (strict)
Prisma format:        PASS
Prisma validate:      PASS — "The schema is valid"
Prisma generate:      PASS — Prisma Client 7.10.0
Tests:                PASS — unit 116/116, integration 56/56, E2E 18/18
Build:                PASS — next build, no warnings (all Phase 1 routes dynamic)
Dependency audit:     PASS — pnpm audit --audit-level high: no known vulnerabilities
Migration-from-zero:  PASS — fresh database → 2 migrations → drift check exit 0 → integration 56/56
Other:                PASS — prettier --check; pnpm install --frozen-lockfile; dev database contains 0 rows
```

## 14. Performance

- **Indexes:**
  - owner-leading composites on every list path: `(user_id, updated_at|status|start_date|category|type|date|expiry_date)`
  - per-user unique `key` and `slug`
  - reverse indexes on every join table's second FK
  - `import_record_id` on each importable table
  - `(job_id, review_status)` on the review queue
- **No N+1 queries:**
  - list endpoints run 2 queries (page + count) and fetch relationship counts with `_count`
  - detail endpoints load all relationships with one `include`
  - import duplicate matching loads natural keys once per entity type per batch
  - export uses 8 owner-scoped queries
- **Bounded responses:** every list endpoint, picker and the global search.
- **Not done:** load testing (Phase 12). Substring search does sequential scans within one user's
  rows, which is acceptable at personal scale (hundreds of rows). Add `pg_trgm` GIN indexes if
  collections reach tens of thousands.
- **Known costs:** bulk acceptance runs one transaction per record (about 2,000 small transactions
  for a maximum-size file), so one conflict cannot block the rest. Global search runs 14 small
  queries per request (debounced to 200 ms in the palette).

## 15. Security Review

| #   | Area                            | Finding / control                                                                                                                           | Status                                |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| S1  | IDOR                            | Owner scoping + composite FKs + indistinguishable 404/400; HTTP matrix test                                                                 | Mitigated                             |
| S2  | CSRF                            | Origin / Sec-Fetch-Site check on mutations + SameSite=Lax                                                                                   | Mitigated                             |
| S3  | Input validation                | Zod on all bodies/queries, length bounds, control characters, UUID ids, 256 KiB cap                                                         | Mitigated                             |
| S4  | URL handling / XSS              | http(s)-only URLs at write and render; React escaping; no raw HTML                                                                          | Mitigated                             |
| S5  | SQL injection                   | Prisma parameterisation; explicit LIKE escaping (Prisma does not escape wildcards — discovered and fixed)                                   | Mitigated                             |
| S6  | Import files                    | Size cap before buffering, extension/MIME allow-list, strict UTF-8, NUL rejection, record/column/cell limits, no execution, no file storage | Mitigated                             |
| S7  | SSRF                            | No server-side fetching of user URLs; website import deferred                                                                               | Not applicable (by design)            |
| S8  | CSV export injection            | Formula prefix neutralised                                                                                                                  | Mitigated                             |
| S9  | Rate limiting                   | Per-user limits on mutations, imports, exports; fail-open if Redis is down                                                                  | Mitigated (fail-open noted as a risk) |
| S10 | Auth rate-limit opt-out for E2E | Accepted only for a loopback `APP_URL` (env validation, unit-tested)                                                                        | Mitigated                             |
| S11 | Secrets / logging               | No secrets in snapshots, logs or exports; request bodies never logged                                                                       | Mitigated                             |
| S12 | Audit                           | In-transaction audit for all mutations, imports and exports                                                                                 | Implemented                           |
| S13 | Secret scanning / SAST in CI    | Not implemented                                                                                                                             | Open (Phase 12)                       |
| S14 | Account recovery / MFA          | No password reset, no MFA (Phase 0 risk)                                                                                                    | Open                                  |

## 16. ADRs Created

| ADR  | Decision                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0011 | User ownership on every table; composite FKs on joins; join-attribute and status enums; normalised keys and slugs; provenance via ImportRecord; hard delete + audit; SQL CHECKs                                        |
| 0012 | Education model (dates optional; no evidence link yet; list-only UI)                                                                                                                                                   |
| 0013 | Skill level model: registry, spec default 0–5, validated target level, no self-assessed current level                                                                                                                  |
| 0014 | Import pipeline and review queue: formats, limits, normalised JSONB candidates, natural-key duplicates, update/create/reject + diff/recommendation, dependency-ordered bulk accept, name-based relationship resolution |
| 0015 | API conventions: envelopes, offset pagination (20/100), whitelisted sort, replace-set relationships, error mapping, CSRF origin check, rate limits, loopback-only auth-limit opt-out                                   |
| 0016 | Phase 1 pages as secondary tabs inside the 15 specified navigation items                                                                                                                                               |
| 0017 | Phase 1 scope boundaries and deferred entities                                                                                                                                                                         |

## 17. Specification Gaps / Ambiguities

Still open (also in `docs/SPECIFICATION_INDEX.md` §3):

1. **Knowledge / LearningItem (C4):** no phase in `08`. A product decision is needed.
2. **Metric definitions (C7):** `00` §4 KPIs lack formula, source, frequency and owner. This blocks
   Phase 2 KPI work.
3. **Technology↔Skill, Goal↔Skill (C6):** not in `04` Relationships. They need definitions before
   Phases 4/5.
4. **Import categories Languages/Links (C15):** no entities in `04`.
5. **Website/CV import (`11`):** formats and an SSRF strategy are unspecified.
6. **LinkedIn export format:** not formally specified by LinkedIn. The mapping is best-effort.
7. **Evidence references by title in imports:** titles are not unique, so the first match is
   linked. A stable external id would remove the ambiguity.

## 18. Deferred Features

| Feature                                                                                                | Phase       |
| ------------------------------------------------------------------------------------------------------ | ----------- |
| Command Center KPIs, metric catalogue, ECharts                                                         | 2           |
| Milestones, project health score, portfolio analytics                                                  | 3           |
| Custom level models, evidence-derived skill level, gap/freshness/trend, Technology↔Skill, career graph | 4           |
| Goals & roadmap, Goal↔Project/Skill/Evidence, tasks                                                    | 5           |
| AI Lab                                                                                                 | 6           |
| Architecture                                                                                           | 7           |
| Copilot, semantic search (pgvector), notifications                                                     | 8           |
| Integrations (GitHub, CI/CD, issue trackers), website import                                           | 9           |
| Evidence file uploads, opportunities, portfolio export                                                 | 10          |
| Saved filters, undo, advanced keyboard shortcuts                                                       | 11          |
| Load tests, secret scanning/SAST, backups/restore, monitoring                                          | 12          |
| Knowledge base / LearningItem                                                                          | unscheduled |

## 19. Known Risks

1. **CI has never run on GitHub** (no remote configured). All commands pass locally.
2. **Account recovery** (from Phase 0): no password reset or MFA. Losing the password requires
   database intervention, which matters more now that real data can be stored.
3. **The rate limiter fails open** if Redis is unavailable (availability over strictness).
4. **LinkedIn format drift** could break header recognition; unknown files are rejected, never
   misparsed silently.
5. **Bulk import of a maximum-size file** runs about 2,000 sequential transactions (seconds, not
   minutes, at this scale, but not load-tested).
6. **Hard deletes** are recoverable only from audit snapshots, not via an undo feature.
7. **Phase 0 risks still open:** LAN binding of `next start`, floating Docker tags, GitHub Actions
   pinned to tags rather than SHAs.

## 20. Acceptance Criteria

Evaluated against `10_ACCEPTANCE_CRITERIA.md`. Criteria owned by later phases are N/A.

**Global**

| Criterion                             | Status  | Evidence                                                                                                              |
| ------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Authentication works                  | PASS    | Phase 0 + `auth.int.test.ts`, E2E sign-up/sign-in                                                                     |
| User isolation is enforced            | PASS    | §10; IDOR matrix 13 tests; composite FKs                                                                              |
| All core entities have validation     | PASS    | Zod create/update schemas for all 8 entities + DB CHECKs; `crud.int.test.ts`                                          |
| Database migrations are deterministic | PASS    | migrate-from-zero + `migrate diff --exit-code`                                                                        |
| CI runs lint/typecheck/tests/build    | PARTIAL | `.github/workflows/ci.yml` defines all of them; not yet executed remotely                                             |
| Errors are observable                 | PASS    | Structured logs with requestId; error envelope with requestId                                                         |
| UI supports light/dark mode           | PASS    | Screenshots + E2E theme test; axe scans in both themes                                                                |
| Responsive layout works               | PASS    | Card lists < md; E2E overflow check at 375px                                                                          |
| WCAG 2.2 AA principles are followed   | PARTIAL | 11 automated axe scans, 0 violations; labelled forms, live regions, keyboard flows. No manual screen-reader audit yet |

**Projects**

| Criterion                       | Status | Evidence                                               |
| ------------------------------- | ------ | ------------------------------------------------------ |
| Full CRUD                       | PASS   | API + UI; `crud.int.test.ts`, E2E                      |
| Lifecycle states                | PASS   | `01` §3 lifecycle enum, filter, archive status         |
| Milestones                      | N/A    | Phase 3 (ADR 0017)                                     |
| Skills/technology relationships | PASS   | Replace-set endpoints, picker UI, both directions; E2E |
| Evidence relationships          | PASS   | `project_evidence`; E2E                                |
| Health explanation              | N/A    | Phase 3 (manual health status only)                    |
| Portfolio analytics             | N/A    | Phase 3                                                |

**Skills**

| Criterion                | Status  | Evidence                                                                       |
| ------------------------ | ------- | ------------------------------------------------------------------------------ |
| Configurable level model | PARTIAL | Level-model registry + spec default; user-defined models in Phase 4 (ADR 0013) |
| Evidence relationships   | PASS    | `skill_evidence` with strength/date; E2E                                       |
| Target level             | PASS    | Validated against the level model                                              |
| Gap calculation          | N/A     | Phase 4                                                                        |
| Freshness calculation    | N/A     | Phase 4                                                                        |
| Historical trend         | N/A     | Phase 4 (audit log retains history)                                            |

**Certifications**

| Criterion              | Status | Evidence                                                                        |
| ---------------------- | ------ | ------------------------------------------------------------------------------- |
| Credential data        | PASS   | Name, issuer, category, credential id, dates, status                            |
| Verification link      | PASS   | http(s)-validated, rendered safely; E2E                                         |
| Expiry tracking        | PASS   | Derived expiry state (expired/expiring/valid/none) + filter; unit + integration |
| Skill relationships    | PASS   | `certification_skills`; E2E                                                     |
| Evidence relationships | PASS   | `certification_evidence`; E2E                                                   |

**Analytics** (Phase 1-relevant criteria only)

| Criterion                                                          | Status | Evidence                                                                      |
| ------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------- |
| Export works                                                       | PASS   | JSON + CSV export; integration + E2E                                          |
| Missing data is explicit                                           | PASS   | Explicit empty states everywhere; "—" for empty fields; no fabricated numbers |
| Metric definitions exist / historical periods / cross-link filters | N/A    | Phase 2+                                                                      |

**Security**

| Criterion              | Status | Evidence                                                                 |
| ---------------------- | ------ | ------------------------------------------------------------------------ |
| Authorization tests    | PASS   | §10                                                                      |
| Upload restrictions    | PASS   | Import uploads restricted (§7); evidence file uploads N/A until Phase 10 |
| Secret scanning        | FAIL   | Not implemented (open item S13, Phase 12)                                |
| Dependency scanning    | PASS   | `pnpm audit` in CI; 0 vulnerabilities                                    |
| Prompt injection tests | N/A    | No AI features yet                                                       |
| Audit logging          | PASS   | §11                                                                      |

**Command Center, AI Lab, Architecture, AI Copilot and Production** criteria are N/A (Phases 2, 6,
7, 8 and 12). The exception is "Health endpoint", which has been PASS since Phase 0.

## 21. Phase 2 Readiness

**READY WITH CONDITIONS**

**Why ready:** Phase 2 (Command Center: KPI layer, project health, recent activity, evidence
timeline, skill snapshot, filters, drill-down) needs real persisted data, and that now exists:

- the eight core entities and their relationships, owner-scoped and indexed for per-user
  aggregation
- an audit trail and provenance to drive "recent activity" and "what changed"
- list endpoints with the filters that KPI drill-downs need (status, health, expiry, verified,
  date ranges)

Every check is green.

**Conditions:**

1. **Metric catalogue first (C7).** Before any KPI is displayed, define each one per `05`
   "Metric Governance" (definition, formula, source, frequency, owner, caveats). Without that,
   Phase 2's acceptance criterion "all metrics have definitions" cannot be met, and inventing
   formulas would break the no-fabrication rule.
2. **Activity source.** "Recent activity" and the timeline must read from existing data (audit log,
   evidence dates). The `03` §6 domain-event model is still undefined; decide whether Phase 2
   introduces it or derives activity from the audit log.
3. **Configure a remote and get CI green** (carried over from Phase 0).
4. **Recommended:** decide an account-recovery path before entering significant personal data.

Phase 2 has **not** been started.
