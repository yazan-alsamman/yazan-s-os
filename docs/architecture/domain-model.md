# PEOS Domain Model (Phase 1)

Source of truth: `prisma/schema.prisma`. Decisions: ADR 0003, ADR 0011–0014, ADR 0017.

```mermaid
erDiagram
  users ||--o| profiles : "1:1"
  users ||--o{ experiences : owns
  users ||--o{ education : owns
  users ||--o{ skills : owns
  users ||--o{ technologies : owns
  users ||--o{ certifications : owns
  users ||--o{ projects : owns
  users ||--o{ evidence : owns
  users ||--o{ import_jobs : owns
  import_jobs ||--o{ import_records : contains

  projects ||--o{ project_skills : ""
  skills ||--o{ project_skills : ""
  projects ||--o{ technology_usages : ""
  technologies ||--o{ technology_usages : ""
  projects ||--o{ project_evidence : ""
  evidence ||--o{ project_evidence : ""
  skills ||--o{ skill_evidence : "strength, date"
  evidence ||--o{ skill_evidence : ""
  certifications ||--o{ certification_skills : ""
  skills ||--o{ certification_skills : ""
  certifications ||--o{ certification_evidence : ""
  evidence ||--o{ certification_evidence : ""
  experiences ||--o{ experience_evidence : ""
  evidence ||--o{ experience_evidence : ""

  import_records ||--o{ projects : "provenance"
  import_records ||--o{ skills : "provenance"
  import_records ||--o{ evidence : "provenance (… every entity)"
```

## Entities

| Table            | Key fields                                                                                                                                          | Uniques                          | Indexes                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `profiles`       | headline, summary, location, website, professional_objective                                                                                        | `user_id`                        | `import_record_id`                                  |
| `experiences`    | organization*, title*, start_date*, end_date, description, achievements[]                                                                           | `(id,user_id)`                   | `(user_id,start_date)`                              |
| `education`      | institution*, degree, field_of_study, start/end, description, achievements[]                                                                        | —                                | `(user_id,start_date)`                              |
| `skills`         | name*, key*, category, description, level_model*, target_level, active                                                                              | `(id,user_id)`, `(user_id,key)`  | `(user_id,category)`                                |
| `technologies`   | name*, key*, category, version, notes                                                                                                               | `(id,user_id)`, `(user_id,key)`  | `(user_id,category)`                                |
| `certifications` | name*, issuer*, category, issue/expiry_date, credential_id, verification_url, status*                                                               | `(id,user_id)`                   | `(user_id,status)`, `(user_id,expiry_date)`         |
| `projects`       | name*, slug*, description, problem, solution, impact, status*, health_status*, start/target/completed dates, repository/demo/production URLs        | `(id,user_id)`, `(user_id,slug)` | `(user_id,status)`, `(user_id,updated_at)`          |
| `evidence`       | type*, title*, description, source_url, file_url, date, verified*, verified_at                                                                      | `(id,user_id)`                   | `(user_id,type)`, `(user_id,date)`                  |
| `import_jobs`    | source, file_name, file_size, file_sha256, parser_version, status, entity_hint, counts                                                              | `(id,user_id)`                   | `(user_id,created_at)`                              |
| `import_records` | entity_type, source_ref, payload (JSONB), validation__, confidence, match, matched_entity_id, review_status, decision, result_entity_id, reviewed__ | `(id,user_id)`                   | `(job_id,review_status)`, `(user_id,review_status)` |

`*` = NOT NULL. Every table has `id uuid`, `user_id uuid NOT NULL` (FK → users, cascade),
`created_at` and `updated_at timestamptz(3)`. Importable entities also have `origin` and
`import_record_id`.

**Join tables.** These are `project_skills`, `technology_usages(usage_type,
proficiency_evidence)`, `project_evidence`, `skill_evidence(strength, date)`,
`certification_skills`, `certification_evidence` and `experience_evidence`. Each has:

- `user_id`
- a composite primary key on the two parent ids
- a reverse index on the second parent
- **composite FKs `(parent_id, user_id)` to both parents**, which makes cross-user links
  impossible at the database level

## Integrity (SQL CHECKs in the migration)

- **Non-blank text:** organization, title, institution, names, issuer, evidence title.
- **Keys and slugs:** `key = lower(btrim(key))`; slug matches `^[a-z0-9]+(-[a-z0-9]+)*$` and is at
  most 80 characters.
- **Date order:** experience, education, certification issue/expiry, project target and completion
  dates.
- **Ranges:** `target_level` between 0 and 10; `level_model` not blank.
- **Verification:** `verified` ⇔ `verified_at` set.
- **Review queue:**
  - accepted ⇔ decision and result set
  - not pending ⇒ reviewed_at set
  - accepted ⇒ valid
  - duplicate ⇔ matched_entity_id set
- **Import jobs:** counts consistent and `file_sha256` is 64 hex characters.

## Ownership & provenance

- All reads and writes filter by `user_id` from the server session (ADR 0003, 0011).
- Provenance comes from `origin` + `import_record → import_job`. It covers source, file, sha256,
  parser version, importedAt, confidence, reviewedAt and reviewedBy, as `11` requires.

## Phase 3 additions

- **Milestone** (ADR 0022): `id`, `userId`, `projectId` (composite FK with the owner, cascade on project delete), `title`, `dueDate?`, `completedAt?`, `status` (planned · in_progress · blocked · completed · cancelled), timestamps. Check constraints: completed ⇔ completedAt; title not blank and at most 200 characters.
- **Computed project health** is derived on request and not stored (ADR 0023/0024). `Project.healthStatus` remains the manual assessment.

## Phase 4 additions

- **SkillLevelModel** (ADR 0026): `id`, `userId`, `name` (unique per user), `levels` (JSON array of exactly six entries `{value 0–5, label, description}`, CHECK-bounded). Skills reference it through `levelModel = "custom"` + `levelModelId` (composite FK with the owner, `NO ACTION`).
- **TechnologySkill** (ADR 0030): `userId`, `technologyId`, `skillId`, `createdAt`. Explicit user-maintained link; composite FKs to both owners; cascades.
- **Computed, never stored:** evidence-derived level (skill-level-v1), freshness (freshness-v1), demonstration trend (skill-trend-v1) and gap / critical gap (gap-analysis-v1).

## Phase 5 additions

- **Goal** (ADRs 0031–0033): `id`, `userId`, `parentId?` (composite self-FK with the owner, `NO ACTION`), `title`, `type` (north_star · annual_objective · quarterly_goal), `description?`, `outcome?`, `metric?`, `unit?`, `baseline?`, `target?` (finite floats), `startDate?`, `deadline?`, `status` (draft · active · on_hold · completed · cancelled, default draft), `completedAt?`, `confidence?` (low · medium · high, manual), timestamps. Checks: title not blank; completed ⇔ completedAt; deadline ≥ startDate; not its own parent. A parent is always a strictly higher level, so the hierarchy is acyclic and at most three levels deep.
- **GoalProject**, **GoalSkill**: `(goalId, projectId)` / `(goalId, skillId)` with `userId`; composite FKs to both owners; cascade.
- **GoalDependency**: `(goalId, dependsOnGoalId)` with `userId`; composite FKs; not self (check); acyclic (service).
- **GoalMeasurement**: `id`, `userId`, `goalId`, `date`, `value` (finite), `note?`, `createdAt`. Only recorded values; nothing is interpolated.
- **Milestone.goalId?** (ADR 0032): the goal a project milestone counts toward (Goal 1:N Milestone, `04`). Composite FK with the owner, `NO ACTION`; set only through `PUT /goals/:id/milestones`. Deleting a goal unlinks its milestones.
- **Computed, never stored:** overdue, target attainment (`goal-attainment-v1`), risk with its signals (`goal-risk-v1`), milestone progress, skill readiness (from Phase 4 skill intelligence).

## Phase 6 additions (AI Lab)

- **AIExperiment** (ADR 0036): `id`, `userId`, `projectId?` (optional composite FK, cascade),
  `title`, `hypothesis?`, `objective?`, `category?` (free text), `status` (planned · active ·
  completed · abandoned, default planned), `decision?` (adopt · reject · inconclusive; null =
  undecided), `result?`, `reproducibilityNote?`, `startedAt?`, `completedAt?`, timestamps. Checks:
  title not blank; `completedAt ≥ startedAt`.
- **ExperimentRun** (ADR 0037): `id`, `userId`, `experimentId`, `runNumber` (unique per
  experiment), `label?`, `status` (completed · failed · aborted), recorded config (`model`,
  `modelVersion`, `provider`, `promptVersion`, `datasetName`, `datasetVersion`, `codeRef`,
  `environment`), `runAt?`, and measured `costUsd?`, `latencyMs?`, `tokensInput?`,
  `tokensOutput?` (checks: runNumber ≥ 1; non-negative). Append-only history.
- **ExperimentMetric** (ADR 0038): `id`, `userId`, `runId`, `name`, `value` (finite), `unit?`,
  `higherIsBetter?` (null = no direction), `note?`. A recorded evaluation result.
- **ExperimentEvidence** (ADR 0038): `(experimentId, evidenceId)` with `userId`; reuses Evidence.
- Relationship **Project 1:N AIExperiment** (04). Composite FKs make cross-owner links impossible.
- **Computed, never stored:** reproducibility state (ADR 0039), run comparison and all analytics.
  PEOS never executes a model; measurements are user-recorded (ADR 0040).

## Phase 7 additions (Architecture Intelligence)

- **ArchitectureDecision** (ADRs 0041–0042): `id`, `userId`, `title`, `context?`, `problem?`,
  `constraints?`, `decision?`, `consequences?`, `status` (proposed · accepted · rejected ·
  deprecated · superseded), `decidedAt?` (required unless proposed), `revisitDate?`,
  `supersededById?` (composite self-FK, required ⇔ superseded, never self), timestamps.
- **ArchitectureAlternative**: `id`, `userId`, `decisionId`, `name`, `pros?`, `cons?`,
  `rejectedReason?` (04).
- **DecisionProject**, **ArchitectureDecisionEvidence**, **DecisionComponent**: decision link
  tables to Projects, Evidence (reused) and components.
- **ArchitectureComponent** (ADR 0043): `id`, `userId`, `name`, `key` (unique per owner), `type`
  (service · database · queue · external_api · ai_model · infrastructure), `purpose?`, `critical`.
- **ComponentProject**, **ComponentTechnology** (existing Technology records), **ComponentDependency**
  (`componentId` depends on `dependsOnComponentId`, never self).
- All link tables use composite FKs with the owner and cascade only the link when either side is
  deleted — decisions survive project and technology deletion.
- **Computed, never stored:** revisit due, stale critical, documentation gaps, coverage, the map.

## Phase 8 additions (AI Copilot)

- **CopilotConversation** (ADR 0050): `id`, `userId`, `title` (CHECK: not blank), timestamps.
  `@@unique([id, userId])`, indexed by `(userId, updatedAt)`.
- **CopilotMessage**: `id`, `userId`, `conversationId` (composite FK to the conversation), `role`
  (user · assistant), `content?` (the question), `answer?` (the validated structured answer, JSON),
  `mode?` (synthesis · retrieval_only), and provider usage `provider?`, `model?`, `inputTokens?`,
  `outputTokens?`, `latencyMs?`. A role-payload CHECK enforces user ⇒ `content` and no
  `answer`/`mode`; assistant ⇒ `answer` and `mode`. Usage columns are non-negative or null — a
  missing count is never stored as 0 (ADR 0047).
- **CopilotToolCall**: `id`, `userId`, `messageId` (composite FK to the assistant message), `tool`,
  `input` (JSON), `status` (ok · rejected · failed), `resultCount?`, `durationMs`, `error?`. This is
  the persisted log of every AI tool call (ADR 0047).
- All three tables carry `user_id` and cascade-delete from the owner; messages and tool calls cascade
  from their conversation/message via composite FKs. A foreign id can never be read or written.
- **Computed, never stored:** routing, retrieval, grounding validation, citations and retrieval-only
  answers (derived at request time from authoritative services; ADRs 0046–0049). PEOS never fabricates
  Copilot data; the model never writes domain records.
