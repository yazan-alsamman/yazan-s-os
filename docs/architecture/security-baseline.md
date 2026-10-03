# PEOS Security Baseline (Phases 0–4)

Scope: controls that exist now. Threat model source: `07_SECURITY_PRIVACY.md`.

## HTTP headers

| Header                     | Value                                                          | Where                                     |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| Content-Security-Policy    | per-request nonce; see below                                   | `src/proxy.ts`, `src/lib/security/csp.ts` |
| X-Content-Type-Options     | `nosniff`                                                      | `next.config.ts`                          |
| X-Frame-Options            | `DENY` (plus CSP `frame-ancestors 'none'`)                     | `next.config.ts`                          |
| Referrer-Policy            | `strict-origin-when-cross-origin`                              | `next.config.ts`                          |
| Permissions-Policy         | camera, microphone, geolocation, payment, usb disabled         | `next.config.ts`                          |
| Cross-Origin-Opener-Policy | `same-origin`                                                  | `next.config.ts`                          |
| Strict-Transport-Security  | `max-age=63072000; includeSubDomains` — production builds only | `next.config.ts`                          |
| X-Powered-By               | removed (`poweredByHeader: false`)                             | `next.config.ts`                          |

### CSP

```text
default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'; [upgrade-insecure-requests on https]
```

Documented exceptions:

1. `style-src 'unsafe-inline'` — Radix UI positioning and next/font emit inline `style` attributes.
   Script execution remains nonce-gated, which is the primary XSS control.
2. Development only: `'unsafe-eval'` (React Refresh) and `ws:` (HMR).

The E2E suite asserts zero console errors (CSP violations surface there) on every tested page.

## Authentication & sessions (ADR 0004)

- Better Auth; passwords hashed by the library (scrypt); 12–256 character policy (server + client).
- Database-backed sessions; cookie holds only the signed token. `httpOnly`, `SameSite=Lax`,
  `Secure` + `__Secure-` prefix when `APP_URL` is https (production requires https).
- 7-day expiry, rolling refresh daily; `freshAge` 15 min for future sensitive actions.
- CSRF: Better Auth rejects state-changing requests whose `Origin` is not `APP_URL`
  (verified: cross-origin sign-in → 403). SameSite=Lax cookies add defense in depth.
- Rate limits (Better Auth, in-memory): 100 req/60 s global; sign-in 5/60 s; sign-up 3/60 s.
- Sign-up closed unless `AUTH_ALLOW_SIGNUP=true`. Sign-in errors do not reveal whether an email exists.
- Post-login redirects accept only same-site relative paths (`safeRedirectPath`, unit-tested).

## Authorization (ADR 0003)

- Every protected page/handler resolves the user server-side (`requireAuthenticatedUser`,
  `requireApiUser`). UI hiding is never relied on.
- `requireResourceOwnership()` returns NOT_FOUND for both missing and foreign records (no ID probing).
- Integration tests prove a second user cannot read the first user's records by ID.

## Validation & errors

- Environment validated with Zod at startup; the process exits listing _variable names only_.
- Request input validated with Zod (`parseInput`). Error envelope `{code, message, requestId}`;
  unexpected errors never leak messages, stack traces or infrastructure details.

## Logging

- Structured JSON (pino) with `requestId`, `route`, `method`, `status`, `durationMs`.
- Redaction of `password`, `token`, `accessToken`, `refreshToken`, `idToken`, `secret`, `apiKey`,
  `cookie`, `authorization`, `set-cookie` (unit-tested). Request bodies are never logged.
- Audit log (DB) for user creation, session creation and session revocation; payloads contain no
  secrets (integration-tested).

## Secrets

- `.env*` ignored except `.env.example` (names + safe local values only).
- No repository secrets in CI; CI generates an ephemeral `BETTER_AUTH_SECRET` per run.
- Local Docker credentials are development-only and bound to `127.0.0.1`.

## Dependencies

- `pnpm audit --audit-level high` runs in CI. Current status: 0 known vulnerabilities, after pnpm
  overrides for two transitive Prisma CLI dependencies (`mysql2`, `deepmerge-ts`; see ADR 0005).
- Dependency install scripts are deny-by-default (`pnpm-workspace.yaml#allowBuilds`).

## Phase 1 controls (core data platform)

- **IDOR:** every owned query is scoped by the session user. Foreign ids behave like missing ids:
  404 for items, 400 for relationship targets. The **composite FKs `(parent_id, user_id)`** on
  every join table make cross-user links impossible even if the service layer is bypassed (ADR
  0011). This is covered by the HTTP-level IDOR matrix (`tests/integration/idor.int.test.ts`):
  GET/PATCH/DELETE on 7 entity types, 7 relationship endpoints, join-record injection, lists,
  search, profile and export.
- **CSRF:** mutations with a foreign `Origin`, or with `Sec-Fetch-Site: cross-site`, return 403
  (`assertSameOrigin`).
- **Rate limits:** per user in Redis — mutations 120/min, imports 20/hour, exports 30/hour.
  The limiter fails open if Redis is down. Better Auth limits can be disabled only when
  `APP_URL` is a loopback host (E2E).
- **Input:**
  - JSON bodies are capped at 256 KiB and must be `application/json`.
  - Path ids must be UUIDs.
  - Every field is length-bounded; control characters are rejected in single-line fields.
  - URLs must be absolute http(s); `javascript:`, `data:`, `file:` and others are rejected.
  - Rendered links use `rel="noopener noreferrer nofollow"` and re-check the scheme.
- **SQL:** all queries go through Prisma (parameterised). Search terms escape the LIKE
  wildcards `%`, `_` and the backslash, because Prisma does not. Raw SQL appears only in test fixtures.
- **Imports:**
  - 2 MiB cap, enforced before buffering.
  - Extension and MIME allow-list; strict UTF-8; NUL bytes rejected.
  - At most 2,000 records; CSV column and cell limits.
  - Content is parsed, never executed or fetched, and the original file is not stored (SHA-256
    only).
  - Every record is re-validated with the domain schemas, and nothing persists without review.
- **SSRF:** PEOS never fetches user-supplied URLs server-side in Phase 1. Website import is
  deferred until an SSRF-hardened fetcher exists.
- **XSS:** React escaping; import payloads render as text only; no `dangerouslySetInnerHTML`.
- **Exports:** owner-scoped, attachment + `no-store`, never stored, CSV formula-injection guard,
  audited.
- **Audit:** every create, update, delete, relationship change, import upload, accept/reject and
  export is written **in the same transaction** as the change, with before/after domain snapshots
  and the request id.

## Phase 2 controls (Command Center)

- **Identity:** analytics derives `userId` only from the session. Filter schemas have no
  identity field, and Zod strips unknown keys (`userId`, `ownerId`, `user_id`). Every query —
  counts, groupBy, the monthly raw SQL, activity existence lookups and timeline relations — is
  scoped by `user_id`. Tested over HTTP with two users (`tests/integration/analytics-authz.int.test.ts`).
- **Raw SQL:** a single `$queryRaw` (monthly evidence series) is built with the `Prisma.sql`
  tagged template and `Prisma.join`, so every value is a bound parameter. No `$queryRawUnsafe`.
- **Audit log exposure:** the activity feed never returns before/after snapshots. Labels come
  from a whitelist of name/title fields, `auth.*` events (IP addresses, user agents) are excluded,
  and a record is linked only if it still exists and belongs to the caller (ADR 0021).
- **Rate limits:** all four analytics endpoints use the `analytics` policy (120/min per user).
- **Bounded work:** page sizes are at most 50. The monthly series is capped at 120 months, with
  category and attention lists capped. Custom ranges span at most 20 years. Invalid filters
  return 400 `VALIDATION_FAILED`.
- **CSV download:** chart data tables download client-side through the shared formula-injection
  guard (`escapeCsvCell`).
- **Charts:** ECharts uses the SVG renderer. Tooltips use ECharts' default formatter, which HTML-encodes
  names, including user-entered skill categories. No custom HTML formatter is used.

## Phase 3 controls (project intelligence)

- **Ownership in the database.** Milestones reference `(project_id, user_id) → projects(id, user_id)`, so a milestone can never belong to another owner's project, even if the service layer is bypassed. Every query includes `user_id`.
- **IDOR.** `tests/integration/project-intelligence-authz.int.test.ts` covers the following over HTTP with two users:
  - project read, update and delete;
  - milestone list, create under, read, update and delete;
  - moving a milestone to a foreign project (body `projectId` and `userId` are ignored);
  - linking foreign evidence or technology;
  - foreign dossier intelligence and activity;
  - list filters with foreign ids;
  - portfolio and computed-health isolation.
- **Mass assignment.** Milestone schemas accept only `title`, `dueDate`, `status` and `completedAt`. The project comes from the path and the owner from the session.
- **Integrity.** The check constraints `milestones_completion_chk` (completed ⇔ completion date) and `milestones_title_not_blank_chk` apply. Future completion dates are rejected.
- **Raw SQL.** Two parameterised `$queryRaw` queries were added, using `Prisma.sql` and `Prisma.empty`:
  - the recent-activity count;
  - the monthly completion series. Its table name comes from a fixed two-value literal, never from input.

  No `$queryRawUnsafe` was added.

- **Resource bounds.**
  - At most 500 milestones per project.
  - Milestone and activity pages hold at most 100 rows.
  - Dossier timeline (10) and related skills (10) are capped, as is the portfolio's technology list (15 + summary).
  - Custom ranges are limited to 20 years.
  - Computed health uses a fixed number of queries for any portfolio size.
- **Audit.** Milestone created, updated, completed, reopened and deleted are audited in the same transaction. Project activity reuses the Phase 2 safe DTO, so snapshots never leave the server.
- **XSS and CSV.** All content renders through React. Chart tables export through the shared formula-injection guard.

## Phase 4 controls (skills & career intelligence)

- **Database ownership.**
  - `technology_skills` has composite FKs to the technology and the skill under the same `user_id`.
  - `skills.level_model_id` has a composite FK to the owner's `skill_level_models`.
  - CHECK `skills_level_model_chk` keeps the model marker and the id consistent.
- **IDOR.** `tests/integration/skill-intelligence-authz.int.test.ts` covers, with two real users:
  - foreign skill intelligence, skills and level models (404);
  - modifying or deleting a foreign level model;
  - replacing a foreign skill's technology links;
  - using a foreign level model (400);
  - linking a foreign technology (400);
  - focusing the career graph on a foreign skill, technology or evidence item (404);
  - injected `userId` and `ownerId`;
  - invalid filters (400).
- **Aggregates.** Every grouped query filters `user_id` on both sides of each join (`se.user_id = e.user_id`, …), so no cross-user row can enter a count.
- **Graph traversal.** Bounded by a node limit (≤ 150) and per-relation row caps. The fixed number of queries does not depend on data size, and the focus record is ownership-checked.
- **Raw SQL.** Four parameterised `$queryRaw` queries were added (`Prisma.sql` / `Prisma.empty`): the three signal aggregates and the yearly series. There is no `$queryRawUnsafe`.
- **Validation.** Strict Zod schemas cover filters, graph types, node limits and level models (exactly six levels with values 0–5). Unknown keys are stripped.
- **Audit.** These events are audited in the same transaction:
  - `skill_level_model.created`, `.updated`, `.deleted`
  - `skill.updated` (level model and target)
  - `skill.relations_updated` (technologies, with id lists only)

  Computed analytics are not audited.

- **Accessibility-related security.** All dialogs now return focus to their opener (`useReturnFocus`). No secrets or personal data are logged.
- **Dependency audit (2026-10-03):** `braces <=3.0.3` (GHSA-vfj7-8cjw-p6xm, high, ReDoS/stack exhaustion). It comes only through `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch`, a lint-time dev dependency that is not shipped and never processes user input. No patched release exists on the registry (latest is 3.0.3), so an override is not possible. **Status: open and accepted for development tooling.** Add an override once `braces@3.0.4` is published.

## Not yet implemented (tracked)

MFA, session/device management UI, email verification/password reset, secret scanning and SAST in
CI, file-upload controls (no uploads exist), account/data deletion (export exists since Phase 1).
See the Phase 0 report §16–17.
