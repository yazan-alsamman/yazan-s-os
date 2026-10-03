# PEOS — Development Guide

## Requirements

| Tool           | Version                 | Pinned by                                                         |
| -------------- | ----------------------- | ----------------------------------------------------------------- |
| Node.js        | 24.x                    | `.nvmrc`, `package.json#engines`, `.npmrc` (`engine-strict=true`) |
| pnpm           | 11.x (11.10.0)          | `package.json#packageManager`, `#engines`                         |
| Docker Desktop | any recent (Compose v2) | —                                                                 |

PostgreSQL and Redis are **not** installed on the host; they run in Docker.

## First-time setup

```bash
pnpm install
cp .env.example .env
# Generate a secret and paste it into BETTER_AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
# To create your account, temporarily set AUTH_ALLOW_SIGNUP=true

pnpm infra:up        # PostgreSQL 17 + Redis 8 (waits until healthy)
pnpm db:deploy       # apply migrations to the dev database
pnpm dev             # http://localhost:3100
```

Visit `/sign-up` (only while `AUTH_ALLOW_SIGNUP=true`), create your account, then set
`AUTH_ALLOW_SIGNUP=false` and restart.

> The test database `peos_test` is created automatically on first `infra:up`
> (`docker/postgres/init/`). If your Postgres volume predates that script, run
> `docker compose exec postgres psql -U peos -c "CREATE DATABASE peos_test"`.

Apply migrations to the test database once (and after every new migration):

```bash
# bash
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:deploy
# PowerShell
$env:DATABASE_URL=(Select-String '^TEST_DATABASE_URL=(.*)' .env).Matches.Groups[1].Value; pnpm db:deploy; Remove-Item Env:DATABASE_URL
```

## Ports (non-default to avoid clashing with other local stacks)

| Service    | Address                                                  |
| ---------- | -------------------------------------------------------- |
| App        | `http://localhost:3100`                                  |
| PostgreSQL | `127.0.0.1:55432` (db `peos`, test db `peos_test`)       |
| Redis      | `127.0.0.1:56379` (db 0 = dev, db 1 = integration tests) |

## Scripts

| Script                                           | Purpose                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`                   | Next.js dev server / production build / production server (port 3100)                   |
| `pnpm lint`                                      | ESLint, zero warnings allowed                                                           |
| `pnpm typecheck`                                 | `next typegen` + `tsc --noEmit` (strict)                                                |
| `pnpm format` / `format:check`                   | Prettier write / check                                                                  |
| `pnpm test`                                      | Unit tests (Vitest, no infrastructure)                                                  |
| `pnpm test:integration`                          | Integration tests against `peos_test` + Redis db 1 (needs `infra:up`)                   |
| `pnpm test:e2e`                                  | Playwright smoke tests against the production build (`pnpm build` first) on `peos_test` |
| `pnpm db:generate` / `db:validate` / `db:format` | Prisma client generation / schema validation / formatting                               |
| `pnpm db:migrate`                                | Create + apply a new migration in development (`prisma migrate dev`)                    |
| `pnpm db:deploy`                                 | Apply committed migrations (`prisma migrate deploy`)                                    |
| `pnpm infra:up` / `infra:down`                   | Start / stop local infrastructure                                                       |

`prisma db push` is **not** part of the workflow: every schema change is a committed migration.

## Test strategy

| Layer       | Location                          | Infrastructure                  | Data                                                                        |
| ----------- | --------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| Unit        | `src/**/*.test.ts` (co-located)   | none                            | inline values only                                                          |
| Integration | `tests/integration/*.int.test.ts` | `peos_test`, Redis db 1         | tables truncated before each test; fixtures use the reserved `.invalid` TLD |
| E2E         | `tests/e2e/*.spec.ts`             | production build on `peos_test` | one throwaway account per run (`*@peos-test.invalid`)                       |

The integration setup refuses to run if `TEST_DATABASE_URL` equals `DATABASE_URL`.

## Health

`GET /api/health` → `{ status: healthy | degraded | unavailable, checks: { database, redis, queue, storage } }`.
HTTP 503 only when the database (critical) is unavailable.

## Conventions

- Layering: Route Handler → `defineRoute` (request ID, logging, errors) → auth (`requireApiUser`) →
  validation (`parseInput`) → module service → module repository → Prisma. See
  `docs/architecture/overview.md`.
- No `utils.ts`/`helpers.ts` dumping grounds: helpers live with the concern they serve.
- UI code may not import the database layer (enforced by ESLint `no-restricted-imports`).
- Never hard-code personal data. The app must work with an empty database.

## Phase 1 notes

- After pulling a new migration, apply it to **both** databases: `pnpm db:deploy`, and the same
  command with `DATABASE_URL` set to `TEST_DATABASE_URL`.
- E2E runs set `AUTH_RATE_LIMIT_DISABLED=true` (see `playwright.config.ts`), because many test
  accounts sign in from 127.0.0.1. Env validation accepts this only for a loopback `APP_URL`.
- Exchange-format JSON Schema: `data/peos-exchange.schema.json` is generated from the validators.
  After changing a domain schema, regenerate it with
  `PEOS_UPDATE_SCHEMA=1 pnpm exec vitest run --project unit src/modules/imports/exchange-json-schema.test.ts`.
- `data/profile.seed.json` is an empty exchange-document template. Fill it with your own data and
  import it through Settings → Import, where every record goes through the review queue.
- Never apply schema changes with `prisma db push`. Never run `prisma migrate dev` non-interactively
  when it would prompt for a migration name: use `--name … --create-only`, then `pnpm db:deploy`.

## Phase 2 notes

- **Command Center:** `/command-center`. Metric definitions: `/command-center/metrics`. Every
  number comes from `src/modules/analytics/*`, and the catalogue in `metric-catalogue.ts` is the
  source of truth. `docs/architecture/metric-catalogue.md` is generated from it.
- **Adding a metric:**
  1. Add the catalogue entry.
  2. Add the calculator in `dashboard.service.ts`.
  3. Add the drill-down mapping in `src/components/command-center/drilldown.ts`.
  4. Add tests: governance and unit tests in `analytics.test.ts`, and a KPI-equals-list-total
     assertion in `tests/integration/analytics.int.test.ts`.
- **Charts:** use `EChart` and `ChartCard` (`src/components/charts`) only. Each chart needs a
  one-sentence `ariaLabel` and a data table. Colours come from the `--chart-*` tokens in
  `globals.css` (light and dark).
- **Phase 2 has no schema changes**, so no migration is required.

## Phase 3 notes

- **Migration:** run `pnpm db:deploy` on both databases after pulling. It adds the `milestones` table and the `milestone_status` enum.
- **Project dossier:** `/projects/:id`. Portfolio: `/projects/portfolio`. Milestones: `/projects/milestones`. Computed health: `/projects/health`.
- **Dates:** every "today" rule goes through `src/modules/shared/calendar.ts` (UTC calendar day). Services take an injectable clock — pass a fixed `now` in tests.
- **Computed health:** `src/modules/projects/project-health.ts` is pure and versioned (`project-health-v1`). Change it only together with a new ADR and the catalogue entries `projects.health_score` and `projects.health_component.*`.

## Phase 4 notes

- **Migration:** run `pnpm db:deploy` on both databases. It adds `skill_level_models` and `technology_skills`, and `skills.level_model_id` with its check.
- **Pages:**
  - `/skills/intelligence` — KPIs, radar, distributions and the heatmap (source list)
  - `/skills/graph` — the career graph
  - `/skills/level-models`
  - `/skills/:id` — the skill dossier
- **Algorithms:** `src/modules/skills/skill-intelligence.ts` is pure and versioned (`skill-level-v1`, `freshness-v1`, `skill-trend-v1`, `gap-analysis-v1`). Change them only together with a new ADR and the catalogue entries.
- **Dialogs:** wrap controlled Radix dialogs with `useReturnFocus()` (`src/lib/ui/return-focus.ts`) so focus returns to the opener.
- **Benchmarks** after bulk inserts need `ANALYZE`, or the planner may use stale statistics (see `analytics.md`).

## Phase 5 notes

- **Migration:** run `pnpm db:deploy` on both databases. It adds `goals`, `goal_projects`, `goal_skills`, `goal_dependencies`, `goal_measurements` and `milestones.goal_id` (additive; no data is changed).
- **Pages:**
  - `/goals` — the goals list (source list for every goal metric)
  - `/goals/:id` — the goal dossier
  - `/goals/roadmap` — timeline, quarter board, goal tree and dependencies (window in the URL)
  - `/goals/analytics` — goal KPIs and distributions
- **Rules:** `src/modules/goals/goal.rules.ts` is pure and versioned (`goal-lifecycle-v1`, `goal-attainment-v1`, `goal-risk-v1`). Change them only together with a new ADR and the catalogue entries.
- **Reconciliation:** a new goal filter must be added to `goalWhere` (SQL) **and** `matchesGoalQuery` (analytics), or list totals and metrics drift; the integration tests compare them for every metric.
- **Forms:** `FieldDescriptor.kind = "number"` sends a number or null; `ResourceList` accepts `editFields` when the edit form differs from the create form.
- **Scroll regions:** make horizontally scrolling table wrappers `relative`, or absolutely positioned `sr-only` cells escape the clip and widen the page on phones.

## Phase 6 notes

- **Migration:** run `pnpm db:deploy` on both databases. It adds `ai_experiments`,
  `experiment_runs`, `experiment_metrics`, `experiment_evidence` (additive).
- **Pages:** `/ai-lab` (experiments list), `/ai-lab/:id` (dossier: lifecycle, runs, metrics,
  comparison, evidence), `/ai-lab/analytics`.
- **Rules:** `src/modules/experiments/experiment.rules.ts` is pure and versioned
  (`experiment-lifecycle-v1`, `reproducibility-v1`, `comparison-v1`). Change them only with a new
  ADR and catalogue entries.
- **Reconciliation:** a new experiment filter must be added to `experimentWhere` **and**
  `matchesExperimentQuery`, or list totals and metrics drift; the integration tests compare them.
- **No execution/secrets:** never add a model-execution call or a credential field to experiments
  (ADR 0040); measurements are user-recorded and may be null (not zero).

## Phase 7 notes

- **Migration:** `pnpm db:deploy` adds nine architecture tables (additive).
- **Pages:** `/architecture` (decisions), `/architecture/:id` (decision dossier),
  `/architecture/components`, `/architecture/components/:id`, `/architecture/map`,
  `/architecture/analytics`; the project dossier has an Architecture section.
- **Rules:** `src/modules/architecture/architecture.rules.ts` (`decision-lifecycle-v1`,
  `revisit-v1`, `documentation-gaps-v1`). Change them only with a new ADR and catalogue entries.
- **Reconciliation:** a new decision/component filter must be added to `decisionWhere` /
  `componentWhere` **and** `matchesDecisionQuery` / `matchesComponentQuery`.
- **Prisma `_count` on paginated lists** can regress badly with stale statistics; prefer a grouped
  count scoped to the page's ids (see the Phase 7 benchmark).

## Phase 8 notes (AI Copilot)

- **Migration:** `pnpm db:deploy` adds three copilot tables (additive):
  `copilot_conversations`, `copilot_messages`, `copilot_tool_calls`.
- **AI provider (optional).** `.env` variables: `AI_PROVIDER` (`none` default, or
  `openai_compatible`), and when a provider is set, `AI_BASE_URL` + `AI_MODEL` (required),
  `AI_API_KEY` (optional), `AI_TIMEOUT_MS` (default 30000). With `AI_PROVIDER=none` the Copilot runs
  in deterministic **retrieval-only** mode — no network — which is how CI and the E2E suite run. The
  key is read only in `src/lib/ai/index.ts` and never persisted or logged.
- **Page:** `/copilot` (conversation list, transcript, composer, suggested prompts). Nav flips to
  available.
- **Architecture:** server-deterministic. `copilot.router.ts` picks tools; `copilot.tools.ts` wraps
  authoritative services (the twelve tools — no new metrics); `copilot.grounding.ts` holds the answer
  contract, context builder and the citation/number validators; `copilot.service.ts` orchestrates and
  persists; `src/lib/ai` is the provider abstraction. The model only synthesises JSON; it never routes,
  never sees the DB, and never decides identity.
- **Testing the model path** without a network: construct `createCopilotService(db, stubProvider)`
  with a provider whose `generate` returns a fixed JSON contract (see `tests/integration/copilot.int.test.ts`),
  and unit-test the adapter with an injected `fetchImpl`.
- **Adding a tool** requires a new entry in `TOOLS` (strict Zod input, wrap an authoritative service,
  map to provenance-tagged `Source`s) and a new ADR — the model cannot gain capabilities otherwise.

## Phase 9 notes (Engineering Analytics)

- **No migration.** Phase 9 computes everything from existing dated columns; zero schema changes.
- **Page:** `/analytics` (Engineering Analytics). Nav "Analytics" flips to available. The separate
  "Engineering" (`/engineering`) section stays unavailable — it needs integrations PEOS does not have.
- **Service:** `src/modules/analytics/engineering-analytics.service.ts` — two owner-scoped SQL
  aggregates (a UNION-ALL counts matrix and a UNION-ALL monthly series). Reuses `period.ts`,
  `metric-result.ts`, `comparisonFor`, `monthlyCounts` and the metric catalogue. No new formulas.
- **Adding/changing an activity domain** means editing `DOMAINS` in the service AND `ACTIVITY_SOURCES`
  in the catalogue, and keeping the reconciliation tests green. Each domain's dated column:
  Project.completedAt, Milestone.completedAt, Evidence.date, Goal.completedAt,
  ArchitectureDecision.decidedAt, ExperimentRun.runAt, Certification.issueDate.
- **Metric catalogue doc** is regenerated from the source of truth
  (`src/modules/analytics/metric-catalogue.ts`) into `docs/architecture/metric-catalogue.md`; update
  the catalogue, not the doc, then regenerate the Definitions section.
- **Integration/DORA metrics** (deployment frequency, lead time, change failure rate, time to
  restore, technical debt) remain `unavailable` — no data source; never fabricated (05, ADR 0051).
