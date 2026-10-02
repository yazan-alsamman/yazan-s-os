# PEOS Architecture Overview (Phase 0)

PEOS is a **modular monolith**: one Next.js application whose domain modules have explicit
boundaries so they can be extracted later without rewriting the domain (`03_TECHNICAL_ARCHITECTURE.md` §1, ADR 0002).

```text
Browser
  │  HTTPS, httpOnly session cookie
  ▼
src/proxy.ts ── request ID · nonce CSP · optimistic auth redirect (UX only)
  ▼
Next.js App Router (src/app)
  ├── (auth)/          sign-in, sign-up            public
  ├── (app)/           protected shell + sections  layout validates session server-side
  └── api/
       ├── auth/[...all]   Better Auth
       ├── health          infrastructure health (public, statuses only)
       └── v1/…            versioned JSON API (defineRoute)
  ▼
src/modules/<domain>/   service (business rules) → repository (data access)
  ▼
src/lib/                cross-cutting infrastructure
  ├── config/env.ts      Zod-validated environment (fails fast at startup)
  ├── db/client.ts       Prisma 7 client (pg driver adapter)
  ├── auth/              Better Auth server/client, session guards, ownership primitives
  ├── errors/            AppError + public error envelope
  ├── http/              defineRoute wrapper, client fetchJson
  ├── validation/        parseInput (Zod → VALIDATION_FAILED)
  ├── observability/     pino logger (redaction), request IDs, OTel tracing API
  ├── redis/ queue/      ioredis connection, BullMQ queue registry
  ├── storage/           StorageService interface + S3-compatible adapter
  ├── health/            health model + infrastructure probes
  ├── security/          CSP builder
  └── ui/                cn(), useHydrated()
  ▼
PostgreSQL 17 · Redis 8 · (S3-compatible storage, optional)
```

## Request flow (API)

```text
Route Handler  (src/app/api/v1/me/route.ts)
  → defineRoute()           request ID, span, structured access log, error mapping
  → requireApiUser()        DB-backed session validation → AuthenticatedUser | 401
  → parseInput(schema, …)   Zod validation → 400 VALIDATION_FAILED
  → <module>.service        business rules, ownership (requireResourceOwnership)
  → <module>.repository     Prisma queries, always owner-scoped for user data
  → Prisma → PostgreSQL
```

`GET /api/v1/me` is the reference implementation of this chain.

## Protected pages

`src/app/(app)/layout.tsx` calls `requireAuthenticatedUser()`, which validates the session against
the database (not just the cookie) and redirects to `/sign-in` otherwise. The proxy's cookie check
is only an optimistic redirect for UX.

## Module rules

- A module owns its schemas, service and repository: `src/modules/<domain>/<domain>.{service,repository}.ts`.
- Services receive dependencies explicitly (`createXService({ repository, logger })`) — testable
  without mocks of global state.
- Repositories for user-owned entities expose **no unscoped lookups**; every query includes the owner.
- UI (`src/app`, `src/components`) never imports `@/lib/db` or `@/generated/prisma` (ESLint-enforced).

Modules:

- Phase 0: `account` (own-account read), `audit` (append-only audit log)
- Phase 1: `profile`, `experiences`, `education`, `skills`, `technologies`, `certifications`,
  `projects`, `evidence`, `search`, `imports`, `exports`, and `shared` (field validators,
  in-transaction audit, provenance, ownership checks)

Remaining domain modules from `03` §3 (goals, architecture, ai-lab, analytics, opportunities,
notifications) are created when their phase starts, so there are no empty folders.

Phase 1 details:

- `domain-model.md`: tables, relationships, constraints
- `api.md`: endpoints
- `import-export.md`: formats and pipeline

UI building blocks live in `src/components/data` (list, detail, relationship picker, states),
`src/components/forms/entity-form.tsx` and `src/components/records` (per-entity configuration).

## UI shell

- `src/components/shell/navigation.ts` — single registry for sidebar, mobile bar, command palette
  and section routes; order/labels from `00_MASTER_SPEC.md` §3 (unit-tested).
- Desktop ≥1024px: 260px sidebar collapsible to a 64px rail. <1024px: drawer. <768px: bottom bar
  (4 primary areas + More).
- Sections without functionality render `SectionUnavailable` — no records, no fake actions.
- Theme: next-themes (light/dark/system) over semantic CSS tokens in `src/app/globals.css`.
