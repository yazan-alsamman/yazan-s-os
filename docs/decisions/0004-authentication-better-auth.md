# ADR 0004 — Authentication with Better Auth

**Status:** Accepted · 2026-10-02

## Context

Specification requirements:

- `03` §1: use _"a mature authentication provider/library rather than custom password
  authentication."_
- `07`: secure session management, an MFA-ready architecture, session revocation,
  device/session visibility, and _"passwordless/provider-based authentication where appropriate."_
- `00` §7: strong authentication and session rotation.

No library or provider is named, and the product is self-hosted and private.

## Decision

Use **Better Auth 1.7** (`better-auth`), with:

- **Prisma adapter**, so sessions are stored in PostgreSQL (`users`, `sessions`, `accounts`,
  `verifications`). The cookie carries only a signed token, and every protected request is
  validated against the database. Revocation therefore takes effect immediately.
- **Email + password managed by the library.** Hashing (scrypt), timing-safe verification, and
  rate limiting are all handled by Better Auth. PEOS code never handles password hashes. Policy:
  12–256 characters.
- **Optional GitHub OAuth**, enabled when `AUTH_GITHUB_CLIENT_ID/SECRET` are set. This is the
  "provider-based" path in `07`.
- **Closed sign-up by default** (`AUTH_ALLOW_SIGNUP=false`). The owner enables it once to create
  the account.
- **Session settings:** 7-day lifetime with daily rolling refresh; `freshAge` 15 minutes for future
  sensitive actions. Cookies are `httpOnly`, `SameSite=Lax`, and `Secure` with the `__Secure-`
  prefix on https.
- **CSRF** is handled by Better Auth's Origin check against `trustedOrigins = [APP_URL]`.
- **Rate limits:** sign-in 5/min, sign-up 3/min, 100/min global.
- **Auditing:** database hooks write audit events for user creation, session creation and
  session revocation.
- **Telemetry** is disabled.

## Alternatives considered

- _Auth.js (NextAuth v5):_ a long-running beta with a weaker credentials story. Its maintainers
  have since joined Better Auth.
- _Hosted providers (Clerk, Auth0, WorkOS):_ mature, but they send personal-platform identity data
  to a third party and add recurring cost. They also conflict with "private by default" (`00` §2.10)
  for a single-owner system.
- _Lucia:_ deprecated as a library.
- _Custom implementation:_ explicitly forbidden by `03`.

## Consequences

- MFA (`twoFactor` plugin), passkeys and magic links are plugin additions. They need extra tables
  (new migration) but no redesign.
- No transactional email provider exists, so email verification and password reset are **not**
  enabled. They must be decided before any multi-user exposure.
- Rate limiting uses in-memory storage, which is correct for a single instance. Move it to Redis
  secondary storage before running more than one instance.
- Device/session visibility UI and a revocation UI are deferred. The data (`sessions` with
  `ip_address`, `user_agent`) and the Better Auth endpoints already exist.
