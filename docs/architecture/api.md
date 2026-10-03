# PEOS HTTP API (`/api/v1`) — Phases 1–4

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

### Phase 2 — analytics (ADRs 0019–0021)

All analytics endpoints are `GET`, owner-scoped through the session, and rate-limited per user
(`analytics`, 120/min). None of them accepts an identifier: unknown query keys such as `userId`
are stripped. Values are computed live, and every response includes the period it describes.

| Method | Path                           | Purpose                                                                                                                                                                                       | Validation (schema)      |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| GET    | `/analytics/metrics`           | Metric catalogue: 28 definitions, 19 available and 9 unavailable with reasons                                                                                                                 | —                        |
| GET    | `/analytics/dashboard`         | Command Center KPIs and sections (`range`=30d\|90d\|365d\|all\|custom, `from`, `to`, `projectStatus`, `projectHealth`, `evidenceType`, `evidenceVerified`, `evidenceOrigin`, `skillCategory`) | `dashboardFiltersSchema` |
| GET    | `/analytics/activity`          | The caller's audit log as safe DTOs, excluding `auth.*` (`range`/`from`/`to`, `page`, `pageSize` ≤ 50)                                                                                        | `activityQuerySchema`    |
| GET    | `/analytics/evidence-timeline` | Dated evidence by evidence date, plus `undatedCount` (range, evidence filters, `page`, `pageSize` ≤ 50)                                                                                       | `timelineQuerySchema`    |

**List filters added in Phase 2 for drill-down (ADR 0020).** All are optional and backwards-compatible.

| Endpoint          | Parameter                      | Meaning                                                      |
| ----------------- | ------------------------------ | ------------------------------------------------------------ |
| `/projects`       | `lifecycle=active\|production` | Status in the lifecycle group (ADR 0018)                     |
| `/projects`       | `completedFrom`, `completedTo` | `completedAt` within the dates, inclusive                    |
| `/evidence`       | `dated=true\|false`            | Has, or lacks, an evidence date                              |
| `/skills`         | `hasEvidence=true\|false`      | Has, or lacks, at least one linked evidence item             |
| `/certifications` | `current=true\|false`          | Excludes (true) or keeps only (false) revoked certifications |

### Phase 3 — project intelligence (ADRs 0022–0025)

All endpoints require a session and are owner-scoped. Read endpoints use the `analytics` rate limit (120/min); mutations use the `mutation` limit (120/min) plus the same-origin check. A foreign or missing project or milestone id returns 404, and a malformed path id also returns 404. No endpoint accepts `userId`, `ownerId` or `projectId` in a body: unknown keys are stripped, and the project comes from the path.

| Method               | Path                         | Purpose                                                                                                                                                    | Validation (schema)                                          |
| -------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| GET · POST           | `/projects/:id/milestones`   | The project's milestones (paginated, filters as below) · create a milestone under the project                                                              | `listProjectMilestonesQuerySchema` · `createMilestoneSchema` |
| GET                  | `/milestones`                | Milestones across projects: `projectId`, `status`, `open`, `overdue`, `dated`, `dueFrom/To`, `completedFrom/To`, `q`, `sort`, `page` (≤ 100)               | `listMilestonesQuerySchema`                                  |
| GET · PATCH · DELETE | `/milestones/:id`            | Read · update (title, dueDate, status, completedAt — complete or reopen via `status`) · delete                                                             | `updateMilestoneSchema`                                      |
| GET                  | `/projects/:id/intelligence` | Dossier analytics: lifecycle position, schedule, manual and computed health with components, milestone delivery, evidence intelligence, technology mapping | —                                                            |
| GET                  | `/projects/:id/activity`     | Safe activity DTOs for the project and its milestones (paginated)                                                                                          | `paginationQuerySchema`                                      |
| GET                  | `/analytics/portfolio`       | Portfolio analytics (`range`, `from`, `to`; default 365 days)                                                                                              | `portfolioFiltersSchema`                                     |
| GET                  | `/analytics/project-health`  | Computed health per project (`computed`=bucket, `manual`=status, `page`) — the source list for the computed-health charts                                  | `healthListQuerySchema`                                      |

**List filters added in Phase 3** (optional and backwards-compatible): `/projects?hasEvidence=true|false` and `/evidence?projectId=<uuid>`.

### Phase 4 — skills & career intelligence (ADRs 0026–0030)

All endpoints require a session and are owner-scoped. Reads use the `analytics` rate limit (120 per minute); mutations use `mutation` plus the same-origin check. Foreign and missing ids return 404; foreign relationship targets return 400. No endpoint accepts `userId` or `ownerId`.

| Method               | Path                       | Purpose                                                                                                                                                                                                                                                                                               | Validation                     |
| -------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| GET                  | `/skills/intelligence`     | Source list: derived level, target, gap, freshness, trend and counts per skill. Filters: `category`, `active`, `hasTarget`, `level` (1–5, none), `freshness`, `gap`, `critical`, `targetWithoutEvidence`, `trend`, `productionLinked`; `sort` (gap, name, freshness, level, evidence); `page` (≤ 100) | `skillIntelligenceQuerySchema` |
| GET                  | `/skills/:id/intelligence` | Skill dossier analysis: rule breakdown, freshness, trend, gap, evidence (≤ 100, newest demonstration first), yearly counts, projects, technologies (explicit and via projects), certifications, experiences                                                                                           | —                              |
| PUT                  | `/skills/:id/technologies` | Replace the explicit technology links (`{ technologyIds }`)                                                                                                                                                                                                                                           | `skillTechnologiesSchema`      |
| GET · POST           | `/skill-level-models`      | The default model plus your custom models (with usage counts) · create                                                                                                                                                                                                                                | `levelModelInputSchema`        |
| GET · PATCH · DELETE | `/skill-level-models/:id`  | Read · update · delete (409 while skills use it)                                                                                                                                                                                                                                                      | `levelModelUpdateSchema`       |
| GET                  | `/analytics/skills`        | Career analytics: coverage, critical gaps, targets without evidence, production evidence, freshness, levels, gaps, trend, radar (`category`)                                                                                                                                                          | `skillsAnalyticsFiltersSchema` |
| GET                  | `/analytics/career-graph`  | Bounded graph: `focusType` and `focusId`, `types` (skill, project, technology, certification, experience, evidence), `category`, `limit` (10–150)                                                                                                                                                     | `careerGraphQuerySchema`       |

- **Skill fields added in Phase 4:** `levelModelId` (uuid or null) on skill create and update.
- **List filter added in Phase 4:** `/evidence?skillId=`.

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
