# ADR 0005 — PostgreSQL + Prisma 7 with Docker-based local infrastructure

**Status:** Accepted · 2026-10-02

## Context

`03` §1 names PostgreSQL, Prisma, pgvector, Redis, S3-compatible storage and background jobs. The
owner develops on Windows and should not have to install database servers on the host. Other local
stacks on the same machine already use ports 5432, 6379, 3000 and 9000.

## Decision

**Database**

- PostgreSQL 17 (`postgres:17-alpine`) and Prisma ORM **7.10** with the `prisma-client` generator
  (output `src/generated/prisma`, git-ignored) and the `@prisma/adapter-pg` driver adapter.
  Configuration lives in `prisma.config.ts`.
- Schema conventions: UUID primary keys, `timestamptz(3)` `created_at`/`updated_at`, snake_case
  tables and columns via `@@map`/`@map`, explicit FKs with deliberate `onDelete`, and indexes on
  every FK and hot query path.
- Integrity rules Prisma cannot express are added as SQL `CHECK` constraints in the migration
  (lower-case email, non-blank names and actions, session expiry after creation).
- Every schema change ships as a committed migration. `db push` is not used. CI applies migrations
  from scratch and fails if `schema.prisma` drifts from them (`prisma migrate diff --exit-code`).
- pgvector is **deferred** to the phase that introduces semantic search (`01` §14, Phase 8). The
  image will then change to a pgvector-enabled PostgreSQL 17 build.

**Local infrastructure (`docker-compose.yml`)**

- PostgreSQL on `127.0.0.1:55432`, Redis 8 on `127.0.0.1:56379` (AOF persistence), and the app on
  port 3100. All are bound to loopback only, on non-default ports to avoid clashing with other
  stacks.
- **Test database strategy:** a separate `peos_test` database, created by
  `docker/postgres/init/`, used by integration and E2E tests. Integration tests use Redis logical
  DB 1. The test setup refuses to run if the test and development URLs are equal.

**Object storage**

- `StorageService` interface plus an S3-compatible adapter (`@aws-sdk/client-s3`) that works with
  AWS S3, MinIO or R2 via `S3_ENDPOINT`. It is **optional in Phase 0**: no feature stores files yet,
  so MinIO is **not** in docker-compose. Health reports `not_configured` until a later phase (the
  Evidence Vault, Phase 10) provisions storage.

**Supply-chain overrides**

- `pnpm-workspace.yaml#overrides` pins patched versions of two transitive dependencies of the
  Prisma 7.10 CLI: `mysql2 >=3.23.1` and `deepmerge-ts >=8`. These fix
  GHSA-3f6p-5ww8-9rcr and related advisories. PEOS does not use MySQL. `prisma validate`,
  `generate`, `migrate` and all tests pass with the overrides. Remove them when Prisma ships
  patched ranges.

## Alternatives considered

- _Host-installed PostgreSQL/Redis:_ rejected by requirement and makes setup less reproducible.
- _Prisma 8 (the npm `latest` tag is `8.0.0-rc.19`):_ a release candidate. Rejected for a
  foundation.
- _Drizzle:_ capable, but `03` names Prisma.
- _MinIO in compose now:_ unused infrastructure. Deferred until files exist.
- _Testcontainers:_ better isolation per run, but slower on Windows and needs Docker access from
  tests. The dedicated test database is sufficient for now.

## Consequences

- Fresh clones need `pnpm install`, `pnpm infra:up`, `pnpm db:deploy` (see `docs/DEVELOPMENT.md`).
- An existing Postgres volume created before the init script will lack `peos_test`. The manual
  command is documented.
- Production database hosting, backups and restore drills are Phase 12 work.
