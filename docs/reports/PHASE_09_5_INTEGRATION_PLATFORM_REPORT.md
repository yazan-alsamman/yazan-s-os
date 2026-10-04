# Phase 9.5 — Integration Platform & External Intelligence — Report

**Date:** 2026-10-04 · **Phase:** 9.5 · **Status:** Complete (platform + GitHub; Google/MCP deferred)

---

## Executive Summary

Phase 9.5 establishes a durable, extensible **PEOS Integration Platform** and a first-class **GitHub**
connector. External systems remain authoritative; PEOS stores only connection metadata, **encrypted**
tokens, sync state, normalized external-resource metadata, provenance, and explicit owner-controlled
links. The platform provides a connector registry, AES-256-GCM token encryption, a CSRF/SSRF-resistant
OAuth 2.0 authorization-code flow, connection lifecycle + health, sync state, provenance, audit and
strict owner isolation. GitHub is implemented read-only (repositories, commits, activity) with
explicit repository↔project linking. Google (Gmail/Drive/Calendar) and MCP are scaffolded at the
architecture boundary and deferred.

Per the phase's own rules, this was built **credential-less**: with no OAuth apps/secrets/encryption
key configured in this environment, the app shows honest "Not configured"/"Not connected" states
(never fake data), and automated tests validate the flow against **mocked provider adapters**. **Live
provider validation was not performed.** One additive migration (four tables); drift 0.

## Architecture

See `docs/INTEGRATIONS.md` and ADRs 0052–0053. A provider-neutral hub (`src/modules/integrations`:
crypto, oauth, oauth-state, providers registry, config, provenance, connection service) plus per-
provider adapters (`github/`). A new connector = a registry entry + config + adapter; the hub is
unchanged. Secrets live only in the server-only config/crypto layer.

## Connector Registry

| Provider | Status     | Scopes                                                    | Resources                         | Mutations |
| -------- | ---------- | --------------------------------------------------------- | --------------------------------- | --------- |
| GitHub   | available  | `read:user`, `repo` (min for private read; read-only use) | repositories, commits, activity   | none      |
| Google   | scaffolded | openid, email, gmail.readonly, drive.readonly, calendar   | gmail, drive, calendar (deferred) | none      |

## GitHub

Implemented: OAuth connect → authenticated identity stored; repository list (search/visibility
filter within page, pagination, cached as external resources with freshness); repository detail;
commit history (authored vs committed vs observed dates kept distinct); activity timeline; explicit
repository↔project linking (owner-scoped, audited, removable); on-demand sync with recorded sync
state. GitHub remains the source of truth; PEOS never copies full repositories. No productivity/commit
score is produced.

## Gmail / Google Drive / Google Calendar

**Deferred.** Google OAuth + Gmail/Drive/Calendar connectors are scaffolded at the registry/boundary
(provider definition, OAuth config path, generic OIDC identity) but have no adapter, UI or endpoints
this phase. Gmail additionally requires a verified Google consent screen. See Deferred Work.

## OAuth

Authorization-code flow. Authorize/token/identity endpoints come only from the trusted registry (SSRF
defence). State is an HMAC (keyed by `BETTER_AUTH_SECRET`) over `{userId, provider, nonce, exp}`; the
callback verifies signature, expiry and that the session user matches the embedded user (CSRF /
login-CSRF). The code→token exchange and identity lookup run server-side with an injectable fetch.
Tokens are encrypted immediately and never reach the browser. Provider errors map to neutral PEOS
codes; the callback redirects to an explained settings state.

## MCP

Architecture boundary only (ADR 0053). The connector abstraction can host a future MCP adapter; any
MCP operation must pass the same controls as every connector (owner isolation, tool allow-list,
input/output validation, provenance, audit, rate limits) with no direct DB or token access. MCP tool
responses are untrusted input. No MCP marketplace was built. PEOS does not depend on any AI product's
connector catalog.

## Data Model

Four additive, owner-scoped tables (ADR 0052): `IntegrationConnection` (encrypted tokens, status enum,
scopes, sync timestamps), `IntegrationSyncState` (status enum, counts, cursor, last error),
`IntegrationExternalResource` (provider-native id, normalized metadata, provenance timestamps),
`IntegrationResourceLink` (external resource ↔ project). Composite FKs + composite uniques; cascade
from the owner. Tokens are excluded from every DTO.

## Provenance

Every externally sourced record carries `sourceProvider`, `externalId`, `externalRef`
(e.g. `github:repository:123`), `sourceUrl`, `observedAt`, `lastSyncedAt`. GitHub's timestamps are
kept distinct from PEOS observation time. External ids are provider-native, never fabricated.

## Synchronization

`IntegrationSyncState` tracks per connection + resource type: status (idle/running/success/partial/
failed), start/complete times, cursor, records fetched/updated/failed, last error. A failed sync is
recorded as `failed` (never silent success). GitHub `/user/repos` has no incremental cursor; the
fallback is bounded pagination (documented). Freshness is shown in the UI.

## Security

AES-256-GCM token encryption at rest; tokens decrypted server-side only and excluded from DTOs/logs/
analytics/AI/responses; fail-safe without the key. Signed-state CSRF; registry-only URLs (SSRF);
owner isolation on every query; client-supplied owner/account ids ignored; provider 403/429 →
`degraded` (no aggressive retry); audit of connect/disconnect/reauthorize/sync/link; external content
treated as untrusted. See `docs/architecture/security-baseline.md` (Phase 9.5).

## Auditability

`integration_connection.connected/reauthorized/disconnected/sync_completed/sync_failed` and
`integration_resource_link.linked/unlinked` — in-transaction, never with tokens.

## Testing

| Suite                     | Result                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (`vitest`)           | **301 passed** (33 files) — incl. `integrations-unit.test.ts` (17: crypto round-trip/tamper/wrong-key, OAuth state CSRF, registry, authorize URL + token exchange, GitHub normalization, external id, provenance) |
| Integration (`vitest`)    | **191 passed** (26 files) — incl. `integrations.int.test.ts` (7) and `integrations-authz.int.test.ts` (5)                                                                                                         |
| Security                  | token encrypted at rest + never returned; OAuth-state forgery rejected; two-user IDOR (401/404); disconnected/unconnected refused (409); secret-leak grep clean                                                   |
| E2E (`playwright`)        | **114 passed** (111 prior + `phase9_5.spec.ts` 3) — honest not-configured/not-connected states + axe                                                                                                              |
| Accessibility             | `axe` clean on `/settings/integrations` and the GitHub explorer (automated); manual not claimed                                                                                                                   |
| Typecheck / Lint / Format | **PASS / PASS / PASS**                                                                                                                                                                                            |
| Build                     | **PASS**                                                                                                                                                                                                          |
| Migration / Drift         | `migrate status` "up to date" on `peos` + `peos_test`; **drift 0** (one additive migration)                                                                                                                       |
| Security audit            | `pnpm audit --prod` — no known vulnerabilities; token-leak grep over the module clean                                                                                                                             |

### Performance (test DB; DB + **mocked** provider — live provider latency is network-bound and not measured)

| Operation                         | Median   | p95      | Max      |
| --------------------------------- | -------- | -------- | -------- |
| Providers (registry + state)      | 3.3 ms   | 12 ms    | 12 ms    |
| Connections list                  | 2.6 ms   | 2.8 ms   | 2.8 ms   |
| Repo list (50) incl. cache upsert | 224.8 ms | 285.7 ms | 285.7 ms |
| Sync (50 repos)                   | 226.8 ms | 274.6 ms | 274.6 ms |

The repo-list/sync cost is dominated by 50 sequential per-repo cache upserts (bounded by page size
≤ 50); a batched upsert is a straightforward future optimization.

## Live Provider Validation

**Mocked/stubbed only.** No GitHub/Google OAuth apps, secrets, redirect URIs or
`INTEGRATION_ENCRYPTION_KEY` are configured in this environment, and Gmail scopes require Google
review. No live connection was made; no fake success is reported. To validate live, configure the env
(see `docs/INTEGRATIONS.md`) and connect from `/settings/integrations`.

## Known Limitations

- Credential-less build: live OAuth not validated (mock adapters only).
- GitHub is read-only (no provider mutations); repo search/filter is page-level (GitHub API limit).
- Google (Gmail/Drive/Calendar) and MCP are deferred.
- Repository cache uses sequential upserts (perf note above).
- Navigation: GitHub lives under Settings → Integrations → GitHub; a top-level Engineering → GitHub /
  Email / Drive / Calendar placement is deferred with the Google connectors.
- Manual screen-reader audit not performed (automated axe only).

## Deferred Work

Google OAuth + Gmail (inbox/reader/compose/send with HTML sanitization), Drive (browser), Calendar
(views + create/update with explicit confirmation); the mutation-confirmation UI (policy set in ADR
0053); an MCP adapter; Copilot integration tools (owner-scoped, audited); top-level Email/Drive/
Calendar navigation; batched cache upserts.

## Spec Gaps

Recorded as P9.5-1…P9.5-6 in `docs/SPECIFICATION_INDEX.md` (net-new architecture; credential-less
constraints; scope breadth vs one session; GitHub scope minimality; DORA metrics still unavailable;
page-level GitHub search).

## Regression

Phases 0–9 intact (301 unit, 191 integration, 114 E2E all pass). The only change to existing surfaces
is the added Settings → Integrations tab and the new tables/env; no existing test was weakened. The
pre-existing AI-Lab viewport E2E flake did not recur this run.

## Final Verdict

**READY WITH CONDITIONS.** The Integration Platform and the GitHub connector are implemented, secured
and tested against mocked adapters. The conditions are: (1) **live provider validation is pending**
real OAuth apps/secrets + `INTEGRATION_ENCRYPTION_KEY` (and Google consent-screen verification for
Gmail); (2) Google (Gmail/Drive/Calendar) and MCP connectors are **deferred**. No functionality is
hidden behind mock success.

---

## Addendum — Google connectors (Gmail, Drive, Calendar) with mutations

Following the platform + GitHub pass, the Google connectors were implemented to the same bar
(credential-less + mock-tested). **Registry: Google → available.**

**Gmail** — threads (label + search), thread reader with **HTML sanitization** (`sanitize-html`),
labels; explicit mutations: star / mark read / archive / labels, save draft, **send** (requires
`confirm:true`). Audited `email.sent/draft_created/archived/modified`. Bodies are fetched live, never
cached. UI: `/email` (mailboxes, thread list, reader with formatted/plain toggle, compose + reply
with a review-and-confirm step).

**Drive** — read-only file/folder metadata (My Drive, folder navigation, recent, shared, search);
opens in Google. UI: `/drive`.

**Calendar** — calendars, events in a time range (agenda grouped by day across Today/Week/Month);
explicit **create / update / cancel**, each with a confirmation step and `confirm:true`. Audited
`calendar.event_created/updated/cancelled`. UI: `/calendar`.

**Shared Google client** — transparent access-token refresh via the encrypted refresh token;
provider errors map to connection health; injectable fetch for tests.

**Security additions:** HTML-email sanitization (XSS); refresh tokens encrypted + server-only;
every external mutation explicit + confirmed + audited; the Copilot has no access to these mutations.

**Nav:** `Email`, `Drive`, `Calendar` added (available). **No database changes** (Google reuses the
integration tables; connections store the encrypted Google tokens).

**Tests (updated totals):** Unit **307** (+Google 6: sanitization, Gmail parse/buildRaw, Drive/Calendar
normalization). Integration **198** (+`google.int.test.ts` 7: OAuth connect + token refresh, Gmail
read + send/modify, Drive read, Calendar read + create/cancel, audit, isolation). E2E **115** (+Email/
Drive/Calendar honest not-connected states + axe in `phase9_5.spec.ts`). Typecheck / Lint / Format /
Build: **PASS**. Migration: unchanged (no new tables). Audit: no vulnerabilities; token-leak grep over
the Google module clean. One pre-existing "h1 not found" E2E flake recurred on an unrelated dark-theme
test and passed on rerun.

**Live Google validation:** **not performed** — no Google OAuth app/secret/verified consent screen in
this environment; Gmail/Calendar/Drive scopes require Google's verification review. The code is
complete and mock-tested. To go live: create a Google Cloud project + OAuth consent screen, add the
scopes, set `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` (callback `…/api/v1/integrations/callback/google`)

- `INTEGRATION_ENCRYPTION_KEY`, add yourself as a test user (until verified), and connect from
  Settings → Integrations.

**Updated verdict:** still **READY WITH CONDITIONS** — Gmail/Drive/Calendar (with mutations) are
implemented, secured and mock-tested; live use is conditional on your Google OAuth consent-screen
verification. MCP remains the only deferred item.
