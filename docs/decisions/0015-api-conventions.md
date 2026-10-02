# ADR 0015 — Phase 1 API conventions

**Status:** Accepted · 2026-10-02 · Phase 1

## Context

`03` §4 says: _"Version APIs, validate all inputs, return typed responses, standardise errors,
never expose database internals, enforce authorization server-side."_ Phase 1 adds about 40
endpoints that need one consistent pattern.

## Decision

**Shape**

- Base path `/api/v1`. Resource collections: `GET` (list) and `POST` (create → 201). Items: `GET`,
  `PATCH` (partial update) and `DELETE` (204).
- Envelopes:
  - item: `{ data }`
  - list: `{ data, page: { page, pageSize, total, totalPages } }`
  - error: `{ code, message, requestId, details? }`
- Every handler is built from `defineRoute` → `defineUserRoute` → `collectionRoutes` /
  `itemRoutes` / `relationRoute` (`src/lib/http/*`). Handlers contain no business logic; they parse
  input and call a module service.

**Pagination, sorting, filtering**

- **Offset pagination**: `page` (≥1) and `pageSize` (default 20, maximum 100). Personal collections
  are small (hundreds of rows), so offset paging is simpler than cursors and still deterministic.
- No endpoint returns an unbounded list. Relationship pickers request at most 100 items.
- **Sorting**: `sort=field` or `sort=-field`, restricted to a per-resource whitelist. `id` is
  always appended as a tie-breaker, so ordering is deterministic.
- **Filters**: typed query parameters per resource, for example `status`, `healthStatus`,
  `skillId`, `technologyId`, `startFrom`/`startTo` for projects, and `expiry` for certifications.
  Empty values are ignored.
- **Search**: `q` performs case-insensitive substring matching on each resource's text fields.
  Wildcards are escaped, because Prisma's `contains` does **not** escape `%`/`_` (verified).
  `GET /api/v1/search` returns grouped results (top N per type), or pages through one `type`.

**Relationships**

- Relationships are replaced as a whole set: `PUT /…/:id/skills {skillIds}` and similar.
  Replace-set is idempotent, transactional and audited with before/after id sets.
- Foreign or missing ids return `400 VALIDATION_FAILED` ("One or more related records do not
  exist"), indistinguishable from each other. The composite FKs (ADR 0011) back this up.

**Validation and errors**

- Zod validates every body and query; `PATCH` distinguishes _omitted_ (unchanged) from `null`/`""`
  (cleared).
- JSON bodies are capped at 256 KiB, need `content-type: application/json` (otherwise 415), and
  malformed JSON returns 400.
- Malformed path ids return 404 and never reach the database.
- Prisma errors are mapped: P2002 → 409 CONFLICT, P2003 → 400, P2025 → 404, CHECK violation → 400.
  Unknown errors return 500 `INTERNAL_ERROR` with no detail.

**Security**

- Authentication comes from the server session (`requireApiUser`) and is checked before any input
  is parsed.
- **CSRF defense in depth**: mutations whose `Origin` differs from `APP_URL`, or which carry
  `Sec-Fetch-Site: cross-site`, return 403. `SameSite=Lax` cookies are the first line of defense.
- **Rate limits** (Redis fixed window, per user):
  - mutations: 120/min
  - imports: 20/hour
  - export: 30/hour

  The limiter fails open, with a warning log, if Redis is down.

- Better Auth's own limits (sign-in 5/min, sign-up 3/min) can be disabled with
  `AUTH_RATE_LIMIT_DISABLED=true` **only when `APP_URL` is a loopback host**; env validation rejects
  it otherwise. E2E runs use this because many test accounts sign in from 127.0.0.1.

## Consequences

- A new resource is a schemas, repository and service module plus 2–3 one-line route files.
- Responses use `no-store` caching; exports are attachments.
