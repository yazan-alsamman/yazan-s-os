# PEOS Phase 1 — Implementation Plan (Core Data Platform)

Written before implementation, after re-reading the specification, the Phase 0 code, ADRs 0001–0010
and the tests. Scope source: `08_IMPLEMENTATION_PHASES.md` Phase 1 — _profile, experiences, skills,
technologies, certifications, projects, evidence; CRUD, search, relationships, import/export_.
Education is added because `00` §5 and `11` require it as a profile category (gap C5).

## 1. Reconciled domain model

| Entity                                                                                                                      | Spec source                  | Phase 1 fields (beyond id/userId/timestamps)                                                                                                        | Notes                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Profile                                                                                                                     | `04` Profile                 | headline, summary, location, website, professionalObjective                                                                                         | 1:1 with User; name/timezone/locale stay on User (`04` User) |
| Experience                                                                                                                  | `04` Experience              | organization, title, startDate, endDate, description, achievements[]                                                                                | `evidenceLinks` → ExperienceEvidence join                    |
| Education                                                                                                                   | `00` §5, `11` (not in `04`)  | institution, degree, fieldOfStudy, startDate, endDate, description, achievements[]                                                                  | ADR 0012                                                     |
| Skill                                                                                                                       | `04` Skill, `01` §6          | name, category, description, levelModel, targetLevel, active                                                                                        | no stored "current level" (`00` §2.1); ADR 0013              |
| Technology                                                                                                                  | `04` Technology              | name, category, version, notes                                                                                                                      |                                                              |
| TechnologyUsage                                                                                                             | `04` TechnologyUsage         | projectId, technologyId, usageType, proficiencyEvidence                                                                                             | Project N:M Technology                                       |
| Certification                                                                                                               | `04` + `01` §7               | name, issuer, **category**, issueDate, expiryDate, credentialId, verificationUrl, status                                                            | category added per `01` (C6)                                 |
| Project                                                                                                                     | `04` Project                 | name, slug, description, problem, solution, status, healthStatus, startDate, targetDate, completedAt, impact, repositoryUrl, demoUrl, productionUrl | lifecycle enum from `01` §3                                  |
| Evidence                                                                                                                    | `04` Evidence, `01` §10      | type, title, description, sourceUrl, fileUrl, date, verified                                                                                        | provenance structured (below)                                |
| ProjectSkill, ProjectEvidence, SkillEvidence(strength, date), CertificationSkill, CertificationEvidence, ExperienceEvidence | `04` Relationships, `01` §10 | —                                                                                                                                                   | explicit join tables                                         |
| ImportJob, ImportRecord                                                                                                     | `00` §9, `11`                | review queue                                                                                                                                        | ADR 0014                                                     |

Deferred (ADR 0017): LearningItem, Goal, Milestone, Task, Opportunity, Technology↔Skill,
Goal↔Skill, import categories _Languages_ and _Links_ (no data model in `04`).

## 2. Cross-cutting design

- **Ownership:** every table has non-null `user_id`. Join tables carry `user_id` and reference both
  parents through **composite FKs `(id, user_id)`**. The database itself therefore rejects linking
  one user's project to another user's skill (ADR 0011).
- **Provenance:** every importable entity has `origin` (manual | import) and `import_record_id`. The
  ImportRecord holds confidence, reviewedAt and reviewedBy. Its ImportJob holds source, file name,
  sha256, parser version and importedAt. This covers every `11` provenance field.
- **Duplicate detection:** a normalised `key` (Skill, Technology) or `slug` (Project), plus natural
  keys for the others.
- **API:** REST under `/api/v1`. Offset pagination (default 20, max 100), whitelisted sorts,
  replace-set relationship endpoints, `defineRoute` with Origin check on mutations, JSON body size
  limit, Redis rate limits for mutations, imports and export (ADR 0015).
- **Transactions:** every mutation runs in one transaction together with its audit entry.
- **Search:** user-scoped case-insensitive matching (escaped `ILIKE` via Prisma), paginated; a
  global endpoint returns per-type groups.
- **Import:** JSON (PEOS format = export format), CSV (per entity), LinkedIn export CSVs.
  Pipeline: parse → normalise → validate → duplicate-match → review (accept create/update, reject)
  → persist with provenance.
- **Export:** JSON (all entities, relationships, provenance) and CSV per entity, with formula
  injection guarded. Downloaded directly, never stored.

## 3. UI (within the spec navigation, ADR 0016)

- Career Intelligence → Profile · Experience · Education
- Projects (list, detail)
- Skills → Skills · Technologies (list, detail)
- Certifications (list, detail)
- Evidence Vault (list, detail)
- Settings / Integrations → Account · Import (review queue) · Export
- The command palette's Search becomes real.

## 4. Order of work

1. Schema + migration (+ SQL CHECKs), ADRs.
2. Shared infrastructure: pagination/sort, body reading, Origin check, rate limiter, audit actions,
   search escape.
3. Modules (schemas → repository → service) and routes for each entity and relationship.
4. Import (parsers, normaliser, review service, routes) and export.
5. UI primitives, then pages.
6. Tests: unit (validators, parsers, CSV, normalisation), integration (CRUD, relations,
   transactions, IDOR matrix, import, export, search), E2E (6 critical flows + axe).
7. Migration from zero, full validation, docs, report.
