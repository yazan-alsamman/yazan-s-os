# Security Operations

_Phase 12 · security controls inventory, scanning, rotation, and the executed security test matrix.
See [ADR 0059](../decisions/0059-security-scanning.md)._

## Control inventory (as implemented)

| Control                         | Where                                                                         | Notes                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Authentication                  | better-auth, DB-backed sessions                                               | 7-day expiry; validated against the DB session, not the cookie alone                           |
| Session cookies                 | `src/lib/auth/auth.ts`                                                        | `httpOnly: true`, `sameSite: "lax"`; `secure` in production (HTTPS origin)                     |
| Authorization / owner isolation | service layer + composite FKs `(id, userId)`                                  | every query owner-scoped; cross-owner access returns 404; join-record IDOR blocked at the DB   |
| CSRF defense-in-depth           | `assertSameOrigin` in `route-handler.ts`                                      | mutations require same-origin `Origin` / `sec-fetch-site`; SameSite=Lax is the first line      |
| Input validation                | zod schemas at every route (`parseQuery`/`parseBody`)                         | malformed → 400/415, never 500; unknown fields stripped                                        |
| Output safety                   | escaped React text; `safeUrl`/`optionalHttpUrl` http(s) allowlist             | no `dangerouslySetInnerHTML` on user/GitHub content; non-http(s) schemes rejected              |
| SSRF posture                    | no server-side fetch of user-supplied URLs                                    | GitHub/Google clients use fixed API bases; user URLs are stored + rendered only, never fetched |
| Rate limiting                   | `enforceRateLimit` (Redis), per-user mutation default + per-endpoint policies | integrations/AI/search have their own policies                                                 |
| Error envelope                  | `toErrorBody(error, requestId)`                                               | stable `{code,message,requestId}`; no stack/DB details to clients; 5xx logged server-side only |
| Secret redaction (logs)         | pino `redact` (`REDACTED_PATHS`)                                              | passwords/tokens/cookies/authorization never logged                                            |
| Secret redaction (AI)           | `copilot.redact`                                                              | strips AWS/GitHub/OpenAI-shaped secrets from model context                                     |
| Audit logging                   | `auditInTx`                                                                   | actor, action, entity, before/after snapshots on mutations; no secrets                         |
| Token encryption                | `INTEGRATION_ENCRYPTION_KEY`                                                  | OAuth tokens encrypted at rest                                                                 |
| Auth guard                      | `requireApiUser`                                                              | anonymous `/api/v1` requests → 401 before any data access                                      |

## Scanning (CI)

| Scan         | Tool                            | Where                    | Policy                                                                                   |
| ------------ | ------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| Dependencies | `pnpm audit --audit-level high` | `ci.yml` verify job      | fails on high+; documented exceptions in `pnpm-workspace.yaml` `auditConfig.ignoreGhsas` |
| Secrets      | gitleaks (`.gitleaks.toml`)     | `ci.yml` secret-scan job | full history (`fetch-depth: 0`); test fixtures allowlisted                               |
| SAST         | CodeQL (`security-and-quality`) | `codeql.yml`             | JS/TS, on push/PR + weekly                                                               |

### Current scan results (2026-10-04)

- **Dependencies:** 1 high — `braces` ReDoS (GHSA-vfj7-8cjw-p6xm), a **dev/CI-only** transitive of
  `eslint-config-next`'s glob tooling, **not in the runtime bundle**, no published fix (latest braces
  is 3.0.3). Accepted via documented `ignoreGhsas`; re-check when a patched braces ships. No other
  high/critical.
- **Secrets (local scan):** no real secrets in tracked files. `.env` is gitignored and untracked.
  Only hits are intentional redaction-test fixtures (AWS's documented example key + obvious
  placeholders) — allowlisted.
- **SAST (CodeQL):** runs in CI (GitHub-hosted); results appear under the repo's Security tab. Not
  executable in this local environment.

## Secret rotation

Rotate on suspected compromise or on a schedule. Order of impact:

1. `BETTER_AUTH_SECRET` — invalidates all sessions (users re-login). Low blast radius.
2. `INTEGRATION_ENCRYPTION_KEY` — **existing encrypted OAuth tokens become undecryptable**; users must
   reconnect integrations. Rotate only when necessary; communicate the reconnect.
3. Database / Redis credentials — update `.env`, redeploy.
4. OAuth client secrets (GitHub/Google) — rotate at the provider, update `.env`, redeploy; revoke old.

After rotation: redeploy (`deploy.sh`), confirm `/api/health`, and run a secret-scan over history.

## Executed security test matrix (2026-10-04)

Run via the integration suite (`idor.int.test.ts`, `ownership.int.test.ts`, `*-authz.int.test.ts`,
`infrastructure.int.test.ts`) and HTTP unit tests (`src/lib/http/http.test.ts`). **30/30** in the
security subset passed; full integration suite is green.

| Area         | Test                                                                           | Result                                          |
| ------------ | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| Auth         | anonymous `/api/v1` request → 401 before data access                           | VERIFIED (idor)                                 |
| Auth         | invalid/malformed session rejected                                             | VERIFIED (session layer)                        |
| AuthZ        | cross-owner GET/PATCH/DELETE → 404, record unchanged                           | VERIFIED (idor, all record types)               |
| AuthZ        | cross-owner relationship mutation blocked                                      | VERIFIED (idor)                                 |
| AuthZ        | join-record IDOR (link another user's record) blocked                          | VERIFIED (idor)                                 |
| AuthZ        | injected owner/resource id isolated                                            | VERIFIED (idor, *-authz)                        |
| AuthZ        | lists/search/profile/export exclude other users' data                          | VERIFIED (idor)                                 |
| CSRF         | cross-origin browser mutation refused                                          | VERIFIED (idor + http.test)                     |
| Input        | malformed id → 404, malformed body → 400/415, never 500                        | VERIFIED (idor)                                 |
| XSS          | user/GitHub text rendered as escaped React text                                | VERIFIED (by construction; no dangerous HTML)   |
| SSRF         | user URLs never fetched server-side; http(s) allowlist for render              | VERIFIED (design + URL schema tests)            |
| Files        | evidence files are external URLs (http(s) validated); no upload execution path | VERIFIED (design) / N/A (no local upload store) |
| Rate limit   | repeated mutations throttled per user                                          | VERIFIED (rate-limiter unit/integration)        |
| Secrets      | repository + history scan                                                      | VERIFIED (local scan clean; gitleaks in CI)     |
| Dependencies | high+ vulnerability scan                                                       | VERIFIED (1 documented dev-only exception)      |
| AI           | secret redaction from model context                                            | VERIFIED (copilot.redact tests)                 |
| AI           | owner-scoped, grounded, cited; no raw SQL to model                             | VERIFIED (copilot-authz + design)               |
| API          | malformed payload / unexpected fields                                          | VERIFIED (zod strips unknown; 400)              |

"VERIFIED" here means **verified locally / in the isolated test environment**, not in production.
