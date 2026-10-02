# ADR 0009 — Nonce-based CSP and baseline security headers

**Status:** Accepted · 2026-10-02

## Context

`07` lists XSS, CSRF and clickjacking-class threats. `00` §7 requires CSRF/XSS protection. The CSP
must not break Next.js, Radix UI or next-themes.

## Decision

- **Per-request nonce CSP** set in `src/proxy.ts`: `script-src 'self' 'nonce-…' 'strict-dynamic'`.
  Next.js applies the nonce to its own scripts, and next-themes receives it via the root layout.
- Remaining directives: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `frame-ancestors 'none'`, `img-src 'self' data: blob:`, `font-src 'self'`,
  `connect-src 'self'`, and `upgrade-insecure-requests` on https.
- Documented exceptions:
  - `style-src 'unsafe-inline'`, because Radix UI and next/font use inline style attributes.
  - Development only: `'unsafe-eval'` and `ws:`, for React Refresh and HMR.
- Static headers in `next.config.ts`: `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`,
  `COOP: same-origin`, HSTS (production builds only), and no `X-Powered-By`.

## Alternatives considered

- _Static CSP with `'unsafe-inline'` scripts:_ this allows static rendering, but it gives up the
  main XSS protection. Rejected. All PEOS pages are per-user dynamic anyway.
- _Hash-based CSP:_ impractical with framework-generated inline scripts.

## Consequences

- Every page is dynamically rendered, which is already true because of authentication.
- New third-party scripts or origins (analytics, OAuth avatars, AI streaming endpoints) need an
  explicit CSP change in `src/lib/security/csp.ts`, which is unit-tested.
- The E2E suite fails on any console error, which catches CSP violations.
