# PEOS HTTP API (`/api/v1`) — Phase 1

Conventions: ADR 0015.

- **Authentication:** every endpoint requires a session cookie (401 otherwise), except
  `/api/health` and Better Auth's own `/api/auth/*`.
- **Ownership:** every record is the caller's own. Foreign ids behave exactly like missing ids
  (404 for items, 400 for relationship targets).
- **Validation:** Zod, server-side, on every body and query.

| Method               | Path                                      | Purpose                                                                                                                                      | Validation (schema)                                                  |
| -------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| GET                  | `/me`                                     | Own account                                                                                                                                  | —                                                                    |
| GET · PATCH          | `/profile`                                | Own profile (identity + professional profile; upsert on first save)                                                                          | `updateProfileSchema`                                                |
| GET · POST           | `/experiences`                            | List (q, current, sort, page) · create                                                                                                       | `listExperiencesQuerySchema` · `createExperienceSchema`              |
| GET · PATCH · DELETE | `/experiences/:id`                        | Detail (evidence, provenance) · update · delete                                                                                              | `updateExperienceSchema`                                             |
| PUT                  | `/experiences/:id/evidence`               | Replace evidence links                                                                                                                       | `{ evidenceIds }`                                                    |
| GET · POST           | `/education`                              | List (q, sort, page) · create                                                                                                                | `listEducationQuerySchema` · `createEducationSchema`                 |
| GET · PATCH · DELETE | `/education/:id`                          | Detail · update · delete                                                                                                                     | `updateEducationSchema`                                              |
| GET · POST           | `/skills`                                 | List (q, category, active, hasTarget, sort, page) · create                                                                                   | `listSkillsQuerySchema` · `createSkillSchema`                        |
| GET                  | `/skills/categories`                      | Categories in use + level models                                                                                                             | —                                                                    |
| GET · PATCH · DELETE | `/skills/:id`                             | Detail (projects, evidence+strength, certifications) · update · delete                                                                       | `updateSkillSchema`                                                  |
| PUT                  | `/skills/:id/evidence`                    | Replace evidence links `{evidenceId, strength, date}`                                                                                        | `skillEvidenceLinksSchema`                                           |
| GET · POST           | `/technologies`                           | List (q, category, sort, page) · create                                                                                                      | `listTechnologiesQuerySchema` · `createTechnologySchema`             |
| GET · PATCH · DELETE | `/technologies/:id`                       | Detail (projects + usage type) · update · delete                                                                                             | `updateTechnologySchema`                                             |
| GET · POST           | `/certifications`                         | List (q, status, issuer, expiry, sort, page) · create                                                                                        | `listCertificationsQuerySchema` · `createCertificationSchema`        |
| GET · PATCH · DELETE | `/certifications/:id`                     | Detail (skills, evidence) · update · delete                                                                                                  | `updateCertificationSchema`                                          |
| PUT                  | `/certifications/:id/skills`              | Replace related skills                                                                                                                       | `{ skillIds }`                                                       |
| PUT                  | `/certifications/:id/evidence`            | Replace evidence links                                                                                                                       | `{ evidenceIds }`                                                    |
| GET · POST           | `/projects`                               | List (q, status, healthStatus, skillId, technologyId, startFrom/To, imported, sort, page) · create (with optional relationships, atomically) | `listProjectsQuerySchema` · `createProjectSchema`                    |
| GET · PATCH · DELETE | `/projects/:id`                           | Detail (skills, technologies, evidence, provenance) · update · delete                                                                        | `updateProjectSchema`                                                |
| PUT                  | `/projects/:id/skills`                    | Replace skills                                                                                                                               | `{ skillIds }`                                                       |
| PUT                  | `/projects/:id/technologies`              | Replace technology usages                                                                                                                    | `{ technologies: [{technologyId, usageType, proficiencyEvidence}] }` |
| PUT                  | `/projects/:id/evidence`                  | Replace evidence links                                                                                                                       | `{ evidenceIds }`                                                    |
| GET · POST           | `/evidence`                               | List (q, type, verified, origin, dateFrom/To, sort, page) · create                                                                           | `listEvidenceQuerySchema` · `createEvidenceSchema`                   |
| GET · PATCH · DELETE | `/evidence/:id`                           | Detail (projects, skills, certifications, experiences, provenance) · update · delete                                                         | `updateEvidenceSchema`                                               |
| GET                  | `/search`                                 | `q` (+ `type`, `page`, `pageSize`, `limit`): grouped or per-type paginated results                                                           | `searchQuerySchema`                                                  |
| GET · POST           | `/imports`                                | Import jobs (paginated) · upload multipart `file`, `source`, `entityType?` (rate-limited)                                                    | `uploadFieldsSchema` + file checks                                   |
| GET                  | `/imports/:id`                            | Job + paginated review queue (reviewStatus, validationStatus, entityType); diff for duplicates                                               | `listImportRecordsQuerySchema`                                       |
| POST                 | `/imports/:id/records/:recordId/decision` | `{action:"accept", mode?:"create"\|"update"}` or `{action:"reject"}`                                                                         | `decisionSchema`                                                     |
| POST                 | `/imports/:id/resolve`                    | `{action:"accept_new"\|"reject_pending"}`                                                                                                    | `resolveSchema`                                                      |
| GET                  | `/export`                                 | `format=json` (everything) or `format=csv&entity=…` — attachment, rate-limited                                                               | `exportQuerySchema`                                                  |

**Error codes:**

| Code                                                                | HTTP status |
| ------------------------------------------------------------------- | ----------- |
| `VALIDATION_FAILED`                                                 | 400         |
| `UNAUTHENTICATED`                                                   | 401         |
| `FORBIDDEN` (cross-origin mutation)                                 | 403         |
| `NOT_FOUND`                                                         | 404         |
| `CONFLICT` (duplicate name or slug, already-reviewed import record) | 409         |
| `PAYLOAD_TOO_LARGE`                                                 | 413         |
| `UNSUPPORTED_MEDIA_TYPE`                                            | 415         |
| `RATE_LIMITED`                                                      | 429         |
| `INTERNAL_ERROR`                                                    | 500         |

All error responses carry `requestId`.
