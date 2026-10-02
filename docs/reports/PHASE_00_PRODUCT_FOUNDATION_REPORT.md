# PEOS Phase 0 — Product Foundation Report

| Field             | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| Date              | 2026-10-02                                                                 |
| Phase definition  | `08_IMPLEMENTATION_PHASES.md` → _Phase 0 — Product Foundation_             |
| Foundation commit | `ba368d5deb3fcfdee970250d150acffbb9eb797e` (`main`)                        |
| Baseline          | `docs/audits/PHASE_00_REPOSITORY_AUDIT.md` (specification-only repository) |

## 1. Executive Summary

PEOS now has a working, tested product foundation in its own Git repository. A user can sign in
through a mature authentication library (Better Auth) and reach a responsive, accessible
application shell. That shell is backed by PostgreSQL (Prisma migrations), Redis/BullMQ, validated
configuration, structured logging, a standard error model, security headers and a health endpoint.
No domain features (Projects, Skills, …) were built. Every planned section displays an explicit
"Not available yet" state with no records or numbers.

All local validation passes:

- lint: 0 problems
- typecheck: 0 errors
- unit tests: 66/66
- integration tests: 21/21
- E2E: 8/8, including axe WCAG checks
- build: success
- Prisma format/validate/generate: pass
- migration drift: none
- dependency audit: 0 known vulnerabilities

**Phase 0 acceptance in `08`:**

| Criterion                                  | Status                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean local setup                          | ✔                                                                                                                                           |
| Authenticated user reaches dashboard shell | ✔                                                                                                                                           |
| Database migrations reproducible           | ✔ Applied from scratch to two databases, plus a drift check                                                                                 |
| CI green                                   | ⚠ The workflow is written and every command in it passes locally, but it has **not run on GitHub**. No remote is configured (deliberately). |

**Phase 1 readiness: READY WITH CONDITIONS** (§18).

## 2. Repository Isolation

| Item                   | Value                                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git root               | `C:/Users/Lenovo/Desktop/yazan/Yazan_Personal_Engineering_OS_Spec` (verified with `git rev-parse --show-toplevel` before every Git write)                                                                                               |
| Branch                 | `main`                                                                                                                                                                                                                                  |
| Initial commit         | `ba368d5` — "Phase 0: product foundation" (148 files). This report and `.gitattributes` are in the follow-up commit.                                                                                                                    |
| Remote configuration   | **None.** `git remote -v` prints nothing. Nothing was pushed.                                                                                                                                                                           |
| Parent/home repository | **Not modified.** `C:/Users/Lenovo/.git/config` (md5 `41d53e6b…`) and `.git/HEAD` (md5 `4cf2d64e…`) match their pre-phase hashes. It still has no branches and no index file, and its remote is unchanged (`Ai-tRading-Asistance.git`). |

Decision record: ADR 0001. The nested repository takes precedence for all Git commands run inside
the PEOS directory.

## 3. Final Technology Stack

Versions below are the resolved versions from `node_modules`/`pnpm-lock.yaml`, not ranges.

| Concern         | Choice and version                                                          | Notes                                                                                                 |
| --------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Node.js         | 24.x (host 24.11.1)                                                         | `.nvmrc`, `engines`, `engine-strict=true`                                                             |
| pnpm            | 11.10.0                                                                     | `packageManager`. Dependency build scripts are deny-by-default (`allowBuilds`).                       |
| Next.js         | 16.3.8                                                                      | App Router, `proxy.ts`, Turbopack build                                                               |
| React           | 19.3.0                                                                      |                                                                                                       |
| TypeScript      | 6.0.3                                                                       | strict + `noUncheckedIndexedAccess`, `noImplicitOverride`. TS 7 deliberately not used (ADR 0010).     |
| Tailwind CSS    | 4.3.3                                                                       | CSS-first config, semantic tokens                                                                     |
| shadcn/ui       | CLI 4.21.1, new-york style, `radix-ui` 1.6.7                                | Vendored: button, input, label, dialog, command (cmdk 1.1.1), sheet, dropdown-menu, skeleton, tooltip |
| TanStack Query  | 5.104.0                                                                     | Used by Settings → `GET /api/v1/me`                                                                   |
| React Hook Form | 7.89.0 (+ @hookform/resolvers 5.9.1)                                        | Sign-in and sign-up forms                                                                             |
| Zod             | 4.6.5                                                                       | Environment, request input, forms                                                                     |
| Prisma          | 7.10.0 (`prisma-client` generator, `@prisma/adapter-pg`, pg 8.23.1)         | Prisma 8 RC rejected (ADR 0005)                                                                       |
| PostgreSQL      | 17.10 (`postgres:17-alpine`)                                                | Docker, `127.0.0.1:55432`                                                                             |
| Redis           | 8.10.2 (`redis:8-alpine`)                                                   | Docker, `127.0.0.1:56379`, AOF                                                                        |
| Queue           | BullMQ 6.3.11 + ioredis 6.0.0                                               | ADR 0006                                                                                              |
| Object storage  | `StorageService` + S3-compatible adapter (`@aws-sdk/client-s3` 3.1144.0)    | Optional; not provisioned (ADR 0005)                                                                  |
| Authentication  | Better Auth 1.7.7 (Prisma adapter, DB sessions)                             | ADR 0004                                                                                              |
| Observability   | pino 10.3.1 (JSON, redaction), `@opentelemetry/api` 1.9.1                   | Exporter deferred (ADR 0008)                                                                          |
| Testing         | Vitest 5.0.3; Playwright 1.63.0 (Chromium); @axe-core/playwright 4.13.0     |                                                                                                       |
| Lint/format     | ESLint 9.39.5 + eslint-config-next 16.3.8; Prettier 3.9.9 + tailwind plugin |                                                                                                       |
| Theming         | next-themes 0.4.6                                                           | light / dark / system                                                                                 |
| Icons           | lucide-react 1.49.0                                                         |                                                                                                       |
| Charts          | Apache ECharts, **chosen but not installed**                                | ADR 0007: installed with the first chart (Phase 2)                                                    |

## 4. Architecture Implemented

A modular Next.js monolith (ADR 0002). Full description: `docs/architecture/overview.md`.

```text
src/
├── proxy.ts                     request ID · nonce CSP · optimistic auth redirect
├── instrumentation(.ts|-node.ts) startup env validation · OTel registration point
├── app/
│   ├── (auth)/                  sign-in, sign-up (+ form schema, field component)
│   ├── (app)/                   protected layout → AppShell
│   │   ├── command-center/      honest placeholder + live system status
│   │   ├── settings/            account (via API) + appearance
│   │   └── [section]/           registry-driven "Not available yet" pages (404 otherwise)
│   ├── api/auth/[...all]        Better Auth handler
│   ├── api/health               infrastructure health
│   └── api/v1/me                reference API: route → auth → service → repository
├── modules/
│   ├── account/                 service + repository (own account, credential-free projection)
│   └── audit/                   service + repository (append-only, owner-scoped reads)
├── lib/                         config, db, auth, errors, http, validation, observability,
│                                redis, queue, storage, health, security, ui
├── components/
│   ├── shell/                   navigation registry, sidebar, drawer, bottom nav, palette, menus
│   ├── layout/                  page header, empty state, section-unavailable
│   ├── providers/               QueryClient, ThemeProvider, TooltipProvider
│   └── ui/                      shadcn/ui primitives
└── generated/prisma/            Prisma client (git-ignored, generated)
```

Boundaries are enforced, not just documented:

- ESLint `no-restricted-imports` blocks `src/app/**` and `src/components/**` (except API routes)
  from importing `@/lib/db` or `@/generated/prisma`.
- Repositories expose only owner-scoped reads.
- There are no `utils.ts`/`helpers.ts` files.

## 5. Authentication & Authorization

**Authentication mechanism.** Better Auth 1.7.7, with:

- Library-managed email/password: scrypt hashing (161-character hash observed), 12–256 character
  policy enforced on both server and client.
- Optional GitHub OAuth, active only when both `AUTH_GITHUB_*` variables are set.
- Sign-up closed unless `AUTH_ALLOW_SIGNUP=true`.
- Sign-in errors never reveal whether an account exists.
- Rate limits: sign-in 5/min, sign-up 3/min, 100/min global. These are disabled only when
  `NODE_ENV=test`.

**Session mechanism.**

- Sessions live in the `sessions` table; the cookie (`better-auth.session_token`) holds only a
  signed token.
- The cookie is `httpOnly` and `SameSite=Lax`. It is `Secure` with the `__Secure-` prefix when
  `APP_URL` is https, and production requires https unless the host is localhost.
- Lifetime is 7 days with a daily rolling refresh.
- Sign-out deletes the server-side session. The integration test proves the old cookie is then
  rejected.
- CSRF protection comes from the Origin check: a cross-origin sign-in was verified to return 403.

**Protected routes.**

- `src/proxy.ts` redirects requests without a session cookie to `/sign-in?next=…`. This is UX only.
- `src/app/(app)/layout.tsx` → `requireAuthenticatedUser()` validates the session against the
  database on every protected render.
- API handlers call `requireApiUser(request)` and return a 401 envelope.
- Post-login redirects accept only same-site relative paths.

**Ownership enforcement** (ADR 0003).

- `requireResourceOwnership()` returns `NOT_FOUND` for missing and foreign records alike.
- `ownedBy(userId)` refuses empty IDs.
- Identity comes only from the server session.
- `tests/integration/ownership.int.test.ts` proves a second user cannot read the first user's audit
  entry by ID, and that the response is indistinguishable from a non-existent ID.

## 6. Database Foundation

Migration: `prisma/migrations/20261002163936_init_identity_audit/migration.sql`.

| Model (table)                    | Purpose                                                                                                                                        | Keys, indexes, constraints                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User` (`users`)                 | Identity; spec `04` fields `email`, `name`, `timezone` (default UTC), `locale` (default en), timestamps; Better Auth `email_verified`, `image` | PK UUID; `UNIQUE(email)`; CHECK `email = lower(email)`; CHECK name not blank                                                                          |
| `Session` (`sessions`)           | Server-side sessions                                                                                                                           | PK UUID; `UNIQUE(token)`; FK `user_id` → users `ON DELETE CASCADE`; idx `user_id`, `expires_at`; CHECK `expires_at > created_at`                      |
| `Account` (`accounts`)           | Credential/OAuth links (password hash only)                                                                                                    | PK UUID; `UNIQUE(provider_id, account_id)`; FK `user_id` CASCADE; idx `user_id`                                                                       |
| `Verification` (`verifications`) | Short-lived verification values                                                                                                                | PK UUID; idx `identifier`                                                                                                                             |
| `AuditLog` (`audit_logs`)        | Append-only audit (spec `04` "Audit")                                                                                                          | PK UUID; FK `actor_id` → users `ON DELETE SET NULL`; idx `(actor_id, created_at)`, `(entity_type, entity_id)`; CHECK action and entity_type not blank |

- **Conventions:** UUID primary keys, `timestamptz(3)`, snake_case tables and columns via
  `@map`/`@@map`.
- **Migrations:** `prisma migrate dev` creates them; `migrate deploy` applies them. `db push` is not
  used.
- **Reproducibility:** the migration was applied from scratch to `peos` and `peos_test`, and
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
  returned 0 (no drift).
- **Ownership strategy:** a non-null `userId` FK on every Phase 1+ user-data table, with
  owner-scoped repositories (ADR 0003). Phase 0 has no domain tables. Profile was not created
  because the auth architecture does not need it; it belongs to Phase 1.
- **Test database strategy:** an isolated `peos_test` database plus Redis logical DB 1. Tables are
  truncated before each integration test. The setup refuses to run if
  `TEST_DATABASE_URL == DATABASE_URL`.

## 7. Infrastructure

- **`docker-compose.yml`** (project `peos`):
  - `postgres` (17-alpine, healthcheck `pg_isready`, volume `postgres-data`; the init script creates
    `peos_test`)
  - `redis` (8-alpine, healthcheck `redis-cli ping`, AOF, volume `redis-data`)
  - Both are bound to `127.0.0.1` on non-default ports (55432, 56379), because this machine already
    runs other stacks on 5432, 6379, 3000 and 9000. Those stacks were not touched.
- **Queue:** `src/lib/queue/queues.ts` holds the registry (`peos-system`), a default retry policy
  (3 attempts, exponential backoff) and a `createWorker` factory. No workers run yet.
- **Object storage:** the `StorageService` interface and S3 adapter exist. Storage is not
  provisioned and health reports `not_configured`. MinIO is deliberately not in compose (ADR 0005).
- **Health:** `GET /api/health` returns `{ status, checks: { database, redis, queue, storage },
timestamp }`.
  - Status is `healthy`, `degraded` (a non-critical component is down) or `unavailable` (database
    down → HTTP 503).
  - Each probe times out after 2 seconds.
  - No error text, hostnames or versions are exposed. Failures are logged server-side.
  - Verified live: `{"status":"healthy","checks":{"database":"healthy","redis":"healthy","queue":"healthy","storage":"not_configured"}}`.

## 8. Application Shell

- **Navigation:** a single registry (`src/components/shell/navigation.ts`) with all 15 sections in
  the exact order and labels of `00_MASTER_SPEC.md` §3 (unit-tested). It drives the sidebar,
  drawer, mobile bar, command palette and the `[section]` route. Unknown routes return a real HTTP
  404 (E2E-tested).
- **Honest placeholders:**
  - Only _Settings_ is `available`.
  - Every other section shows its spec summary, "Not available yet", and the phase from `08` where
    it is scheduled. _Knowledge_ is labelled "not yet scheduled in 08".
  - The Command Center additionally shows **live** system status from the health probes. It is the
    only data displayed, and it is real.
- **Layout** (`02` §2):
  - ≥1024px: 260px sidebar, collapsible to a 64px rail. The preference is remembered per browser,
    with a safe fallback when storage is unavailable.
  - <1024px: the menu button opens a navigation drawer.
  - <768px: a bottom bar with Command Center, Projects, Skills and AI Copilot, plus "More".
  - A sticky top bar holds the section label, command trigger, Copilot link, theme menu and
    account menu.
- **Theme:** light, dark and system via next-themes, using semantic tokens (background, surface,
  elevated surface, text, muted text, border, accent, success, warning, danger, info) and a type
  scale (display, h1–h3, body, caption, metric) in `globals.css`. There are no hard-coded colours
  in components.
- **Responsive:** E2E asserts zero horizontal overflow at 375px.
- **Accessibility (WCAG 2.2 AA target):**
  - Skip link, landmarks (`nav[aria-label]`, `main`), one `h1` per page, `aria-current`, labelled
    icon buttons, and labels and errors associated with form inputs.
  - Visible `:focus-visible` rings and `prefers-reduced-motion` handling.
  - axe-core (`wcag2a/aa`, `wcag21a/aa`, `wcag22aa`) reports **zero violations** on sign-in, the
    Command Center, Settings (dark and light) and the mobile drawer.
  - axe found one real contrast defect (the "soon" badge at 80% opacity). It was fixed, not
    suppressed.
- **Command palette:** Ctrl/⌘+K opens it.
  - "Go to …" works for every section.
  - Theme Light/Dark/System and Sign out are real actions.
  - _Search_ is shown **disabled** as "planned — Phase 1" (E2E asserts `aria-disabled`).
- **UX states:** a loading skeleton for the Command Center (leaf-level, so 404s keep their status),
  a route error boundary with retry, a global error boundary, a 404 page, and query
  loading/error/retry on Settings.

## 9. Security Foundation

Details: `docs/architecture/security-baseline.md`, ADR 0009.

- **Headers:**
  - Per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`,
    `frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'self'`).
  - `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP.
  - HSTS in production builds only.
  - No `X-Powered-By`.
  - Documented exceptions: `style-src 'unsafe-inline'` (Radix/next/font) and, in development only,
    `unsafe-eval`/`ws:`.
  - The E2E suite asserts zero console errors (which would surface CSP violations).
- **Secrets:**
  - `.env*` is ignored; only `.env.example` is tracked, with names and safe local values.
  - No secrets are committed (verified on the staged file list).
  - CI uses an ephemeral generated auth secret and no repository secrets.
- **Cookies:** see §5.
- **Validation:**
  - Zod environment validation at startup; the process exits naming the variables, never their
    values (verified manually).
  - Zod request validation via `parseInput`.
  - Client-side validation is mirrored on the server.
- **Authorization:** server-side only (§5).
- **Logging:**
  - pino JSON with `requestId`, `route`, `method`, `status`, `durationMs`.
  - Redaction of password, token, refresh/access/id tokens, secret, apiKey, cookie, authorization
    and set-cookie (unit-tested). Request bodies are never logged.
  - Malformed inbound request IDs are replaced, which prevents log injection.
- **Errors:** the `{code, message, requestId[, details]}` envelope. Unknown errors become
  `INTERNAL_ERROR` without detail (unit-tested).
- **Audit:** user created, session created and session revoked are written to `audit_logs`, with no
  secrets in payloads (integration-tested).
- **Dependencies:** `pnpm audit --audit-level high` reports 0 known vulnerabilities. This required
  pnpm overrides for `mysql2` and `deepmerge-ts`, both transitive dependencies of the Prisma CLI
  (ADR 0005).

## 10. Testing

```text
Lint:               PASS — eslint . --max-warnings=0 → 0 errors, 0 warnings
Typecheck:          PASS — next typegen && tsc --noEmit → 0 errors
Unit tests:         PASS — 66 passed / 66 (11 files)
Integration tests:  PASS — 21 passed / 21 (4 files; real PostgreSQL 17 + Redis 8)
E2E:                PASS — 8 passed / 8 (Playwright, Chromium, production build; 5 axe scans)
Build:              PASS — next build (no warnings)
Prisma validation:  PASS — prisma format · prisma validate · prisma generate
Other:              PASS — prettier --check; pnpm install --frozen-lockfile;
                    prisma migrate deploy (dev + test, from scratch); migrate diff --exit-code (no drift);
                    pnpm audit --audit-level high (0 vulnerabilities)
```

Coverage by area:

| Area                                              | Unit                                                                                | Integration                                                                                         | E2E                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Env validation                                    | 13 cases (required vars, secret length, no value echo, pairs, https rule, booleans) | —                                                                                                   | —                                             |
| Errors / validation                               | envelope mapping, no leakage, Zod details                                           | —                                                                                                   | 401 envelope                                  |
| Authorization primitives                          | ownership, owner filter                                                             | cross-user denial, owner-scoped listing                                                             | protected API and pages                       |
| Auth persistence                                  | password policy, safe redirects                                                     | sign-up rows, hashing, audit events, session validation, forged and revoked cookies, wrong password | sign-up, sign-in, wrong credentials, sign-out |
| Logging / request IDs                             | JSON shape, redaction, ID sanitising                                                | —                                                                                                   | `x-request-id` header                         |
| Health                                            | healthy/degraded/unavailable/timeout/no-leak                                        | real probes                                                                                         | `/api/health`                                 |
| DB constraints                                    | —                                                                                   | uniqueness, CHECKs, cascade / SET NULL, migrations applied                                          | —                                             |
| Redis / queue                                     | —                                                                                   | PING, isolated DB, enqueue with retry policy                                                        | —                                             |
| CSP / route wrapper / storage keys / nav registry | ✔                                                                                   | —                                                                                                   | headers, console clean, 404                   |
| Shell / a11y / responsive                         | —                                                                                   | —                                                                                                   | palette, theme, settings, axe, 375px overflow |

Coverage percentages were not collected; there is no coverage threshold in Phase 0.

## 11. CI

`.github/workflows/ci.yml` runs on `push` to `main` and on pull requests, with `contents: read`
permissions and concurrency cancellation.

- **`verify` job:** frozen install → Prisma generate → Prisma validate → Prettier check → ESLint →
  typecheck → unit tests → build → `pnpm audit --audit-level high`.
- **`integration` job:** service containers Postgres 17 + Redis 8 → ephemeral auth secret → create
  `peos_test` → `migrate deploy` on both databases from scratch → migration drift check →
  integration tests → build → Playwright Chromium → E2E. The Playwright report is uploaded on
  failure.
- **Not configured:** deployment, production connections and repository secrets.
- **Status:** the workflow **has not executed on GitHub**, because no remote exists. Every command
  it runs passes locally, and the build and unit tests were also verified **without** a `.env`, as
  in CI. Linux-only steps (`psql` database creation, `openssl`) have not been exercised.

## 12. Specification Reconciliation

Full table: `docs/SPECIFICATION_INDEX.md` §2.

| #   | Conflict                                                                                                                             | Resolution                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| C1  | `04` entities have no owner, but `07` requires all resources to be user-scoped                                                       | ADR 0003 — `userId` on every user-data table in Phase 1; ownership primitives now                               |
| C2  | Chart library: "ECharts or Recharts"                                                                                                 | ADR 0007 — ECharts, installed in Phase 2                                                                        |
| C3  | Auth provider unnamed; `07` prefers passwordless/provider "where appropriate"                                                        | ADR 0004 — Better Auth, library-managed credentials + optional GitHub OAuth; passwordless/MFA via plugins later |
| C4  | Knowledge is in navigation (`00` §3) but in no phase (`08`)                                                                          | Shown as "not yet scheduled". **Needs a product decision.**                                                     |
| C5  | Education, Opportunity, Notification, import review queue, domain events, metric definitions and tool-call log are undefined in `04` | Deferred to their phases. Phase 1 must define Education and the import review queue.                            |
| C6  | Certification `category` (`01`) is missing in `04`; Technology↔Skill and Goal↔Skill (`00` §5) are missing in `04`                    | Phase 1 schema decision                                                                                         |
| C7  | KPIs and metrics lack formula, source, frequency and owner (`05` governance)                                                         | Phase 2 prerequisite. Phase 0 shows no metrics.                                                                 |
| C8  | The audit was labelled "Phase 0", but `08` Phase 0 is Product Foundation                                                             | `08` is authoritative                                                                                           |
| C9  | The prompt referenced NestJS; `03` specifies modular Next.js                                                                         | ADR 0002 — no NestJS                                                                                            |

## 13. Files Created

All files are new: the repository previously held only the specification and the audit.

- **Repository and tooling:** `.gitignore`, `.gitattributes`, `.npmrc`, `.nvmrc`,
  `.prettierrc.json`, `.prettierignore`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `next.config.ts`, `components.json`,
  `.env.example`
- **Infrastructure:** `docker-compose.yml`, `docker/postgres/init/01-create-test-database.sql`
- **Database:** `prisma.config.ts`, `prisma/schema.prisma`,
  `prisma/migrations/20261002163936_init_identity_audit/migration.sql`,
  `prisma/migrations/migration_lock.toml`
- **Application (`src/app`):** `layout.tsx`, `page.tsx`, `globals.css`, `icon.svg`,
  `not-found.tsx`, `global-error.tsx`.
  - `(auth)/`: layout, credentials-schema (+ test), form-field, sign-in/{page, sign-in-form},
    sign-up/{page, sign-up-form}
  - `(app)/`: layout, error, `[section]/page`, command-center/{page, loading},
    settings/{page, account-panel, appearance-panel}
  - `api/`: `auth/[...all]/route`, `health/route`, `v1/me/route`
- **Runtime entry points:** `src/proxy.ts`, `src/instrumentation.ts`, `src/instrumentation-node.ts`
- **Modules:** `src/modules/account/{account.service, account.repository}.ts`,
  `src/modules/audit/{audit.service, audit.repository}.ts`
- **Infrastructure library (`src/lib`):**
  - `config/env.ts` (+test)
  - `db/client.ts`
  - `auth/{auth, auth-client, session, ownership (+test), password-policy}.ts`
  - `errors/app-error.ts` (+test)
  - `http/{route-handler (+test), fetch-json}.ts`
  - `validation/parse.ts` (+test)
  - `observability/{logger, request-id, tracing}.ts` + `observability.test.ts`
  - `redis/client.ts`, `queue/queues.ts`
  - `storage/{storage-service (+test), s3-storage}.ts`
  - `health/{health-service (+test), infrastructure-probes}.ts`
  - `security/csp.ts` (+test)
  - `ui/{cn, use-hydrated}.ts`
- **Components:**
  - `shell/`: navigation (+test), nav-list, sidebar, mobile-bottom-nav, app-shell,
    command-palette, theme-menu, user-menu, use-sign-out, use-sidebar-collapsed
  - `layout/`: page-header, empty-state, section-unavailable
  - `providers/app-providers`
  - `ui/`: button, input, label, dialog, command, sheet, dropdown-menu, skeleton, tooltip
- **Tests:** `vitest.config.ts`, `playwright.config.ts`, `tests/support/server-only.ts`,
  `tests/integration/{setup, database, database.int.test, ownership.int.test, auth.int.test, infrastructure.int.test}.ts`,
  `tests/e2e/smoke.spec.ts`
- **CI:** `.github/workflows/ci.yml`
- **Documentation:** `docs/SPECIFICATION_INDEX.md`, `docs/DEVELOPMENT.md`,
  `docs/architecture/{overview, security-baseline}.md`, `docs/decisions/README.md` +
  ADRs `0001`–`0010`, this report

## 14. Files Modified

- **Pre-existing repository files:** none. The 12 specification files and `README.md` are
  byte-identical to the audit snapshot (e.g. `00_MASTER_SPEC.md` md5 `7b209437…`) and are excluded
  from Prettier. `docs/audits/PHASE_00_REPOSITORY_AUDIT.md` is unchanged.
- **Outside the repository** (host state, not files in any repository):
  - Docker resources `peos-postgres-1`, `peos-redis-1`, volumes `peos_postgres-data`,
    `peos_redis-data`
  - Playwright Chromium in the user's `ms-playwright` cache
  - pnpm store entries
  - An untracked, git-ignored local `.env` containing a generated auth secret and
    `AUTH_ALLOW_SIGNUP=true` for local development
  - The home-directory repository was not modified (§2).
- **Data:** the local `peos` dev database is **empty**. A smoke-test user created during
  verification was removed when the schema was regenerated. `peos_test` holds throwaway
  `*@peos-test.invalid` test accounts only. No personal data exists anywhere.

## 15. ADRs Created

| ADR  | Decision                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0001 | Dedicated PEOS repository, no remote until the owner provides one; home repository untouched                                                                                               |
| 0002 | Modular Next.js 16 monolith: route → service → repository; no NestJS or microservices; lint-enforced UI/DB boundary                                                                        |
| 0003 | Single-user product with a non-null `userId` on all user data, owner-scoped repositories, NOT_FOUND for foreign records                                                                    |
| 0004 | Better Auth: DB sessions, library-managed credentials, optional GitHub OAuth, closed sign-up, rate limits, audit hooks                                                                     |
| 0005 | PostgreSQL 17 + Prisma 7.10 (pg adapter), snake_case, CHECK constraints, Docker on loopback and non-default ports, `peos_test`, optional S3 storage, pgvector deferred, security overrides |
| 0006 | BullMQ 6 + ioredis queue registry, default retry policy, workers in a separate process later                                                                                               |
| 0007 | Apache ECharts as the only chart library, installed in Phase 2                                                                                                                             |
| 0008 | pino structured logs + request IDs + AppError + OpenTelemetry API; exporter/vendor deferred                                                                                                |
| 0009 | Nonce-based CSP with documented exceptions plus baseline headers                                                                                                                           |
| 0010 | Toolchain pinning: TS 6 (not 7), ESLint 9 (not 10), Prisma 7 (not 8 RC), exact pins for framework and auth                                                                                 |

## 16. Remaining Risks

1. **CI has never run remotely.** Linux-specific steps are unverified until a remote exists.
2. **No password recovery.** Email verification and password reset are disabled (no email
   provider). If the owner loses the password, recovery requires direct database work. A
   recovery path should be decided early: GitHub OAuth as a second login, an email provider, or a
   documented CLI reset.
3. **MFA is not enabled.** The architecture is ready (plugin plus migration).
4. **Rate limiting** covers only `/api/auth` and is in-memory (single instance). `/api/v1` has no
   application rate limit yet.
5. **`next start`/`next dev` listen on all interfaces.** The app was reachable on the LAN address
   during verification. Authentication protects it, but local runs expose the sign-in page to the
   network.
6. **`style-src 'unsafe-inline'`** remains a CSP exception (scripts stay nonce-gated).
7. **Supply chain:** Docker images use floating tags (`17-alpine`, `8-alpine`), and GitHub Actions
   are pinned to major tags rather than commit SHAs. Two pnpm overrides patch Prisma CLI
   transitive dependencies and must be revisited when Prisma updates.
8. **The home-directory Git repository** with an unrelated remote still exists. It is outside
   PEOS's scope and is the owner's decision.
9. **Specification gaps** (C4–C7) will block parts of Phase 1/2 design if they are not decided.

## 17. Deferred Work

| Item                                                                                                                                                               | Target phase (per `08`)                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Profile, Experience, Skill, Technology, Certification, Project, Evidence schemas + CRUD + relationships + search + import/export + review queue + seed JSON schema | Phase 1                                            |
| Global search (palette "Search" is disabled)                                                                                                                       | Phase 1                                            |
| Command Center KPIs, metric catalogue, ECharts install + accessible chart wrapper, date ranges, drill-down                                                         | Phase 2                                            |
| Background workers (process entrypoint, scheduled analytics)                                                                                                       | First job-producing phase (1 or 2)                 |
| pgvector + semantic search, AI provider, Copilot tool layer, tool-call log                                                                                         | Phase 8                                            |
| Integrations (GitHub, CI/CD, issue trackers) + Settings → Integrations                                                                                             | Phase 9                                            |
| Object storage provisioning, uploads (MIME/size checks, signed URLs)                                                                                               | Phase 10                                           |
| Command palette actions (create evidence, add skill, log experiment, create ADR, ask AI), saved filters, shortcuts                                                 | Phases 1–11 as features land; polish in Phase 11   |
| MFA, session/device management UI, email verification/reset, `/api/v1` rate limiting, secret scanning + SAST in CI, privacy export/delete                          | Before multi-user exposure; Phase 12 at the latest |
| OTel exporter, error tracking, metrics, deployment environments, backups/restore, runbooks                                                                         | Phase 12 (or with the hosting decision)            |

## 18. Phase 1 Readiness

**READY WITH CONDITIONS**

**Why ready:** everything Phase 1 builds on exists and is verified:

- An isolated repository with an initial commit
- A reproducible migration workflow with a drift check
- A working DB-backed authentication and session boundary
- Server-side ownership primitives with a proven cross-user denial test
- The route → service → repository pattern with a reference endpoint
- Validation and the error envelope
- Audit logging
- A responsive, accessible shell whose navigation already routes to every Phase 1 section
- Unit, integration and E2E harnesses
- A CI definition

All local checks are green.

**Conditions:**

1. **Product decisions for the Phase 1 schema:**
   - Education (C5) and the import review-queue design (`00` §9, `11`)
   - Certification `category` and the Technology↔Skill and Goal↔Skill relations (C6)
   - Whether Knowledge belongs in Phase 1 (C4)
2. **Configure a PEOS remote** (owner's choice) and confirm the CI workflow passes on GitHub. This
   closes the remaining Phase 0 acceptance item ("CI green").
3. **Recommended before entering personal data:** choose an account-recovery path (risk 2). Then
   create the owner account and set `AUTH_ALLOW_SIGNUP=false`.

Phase 1 has **not** been started.
