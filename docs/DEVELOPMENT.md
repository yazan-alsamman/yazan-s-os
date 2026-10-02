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
