# PEOS Security Baseline (Phase 0)

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

## Not yet implemented (tracked)

MFA, session/device management UI, email verification, application-level rate limiting for
`/api/v1`, secret scanning and SAST in CI, upload controls (no uploads exist), privacy export/delete.
See the Phase 0 report §16–17.
