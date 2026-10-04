# PEOS Integrations (Phase 9.5)

The Integration Platform connects PEOS to external systems while keeping those systems authoritative.
PEOS stores only connection metadata, encrypted tokens, sync state, normalized external-resource
metadata, provenance and the links you create. See ADR 0052 and ADR 0053.

## Architecture

```
PEOS
 └── Integration Hub (src/modules/integrations)
      ├── crypto.ts          AES-256-GCM token encryption at rest
      ├── oauth.ts           authorization-code flow (authorize URL + token exchange)
      ├── oauth-state.ts     HMAC signed state (CSRF defence)
      ├── providers.ts       connector registry (non-secret definitions)
      ├── config.ts          server-only OAuth client config
      ├── provenance.ts      external identity + provenance
      ├── integration.service.ts   connection lifecycle (connect/callback/refresh/disconnect/health)
      └── github/            GitHub adapter + read service (repos, commits, activity, linking, sync)
```

A connector = a `providers.ts` entry + an adapter. The hub does not change when a connector is added.

**Status:** GitHub — **available** (read-only: repositories, commits, activity; explicit
repository↔project linking). Google (Gmail, Drive, Calendar) and MCP — **scaffolded** at the
architecture boundary, **deferred** (no adapter/UI yet).

## OAuth flow

1. User clicks Connect → `POST /api/v1/integrations/connect/:provider` returns a provider authorize
   URL carrying a signed `state` (HMAC over userId+provider+nonce+exp).
2. User authorizes at the provider → provider redirects to
   `GET /api/v1/integrations/callback/:provider`.
3. PEOS verifies the state (signature, expiry, **session user == embedded user**), exchanges the code
   for a token server-side, fetches the account identity, encrypts the token and stores the
   connection, then redirects to `/settings/integrations?connected=…`.

Authorize/token/identity endpoints come only from the trusted registry (SSRF defence). Tokens never
reach the browser and are never returned by the API, logged, analysed or sent to the AI.

## Security

- **Tokens** encrypted with AES-256-GCM (`INTEGRATION_ENCRYPTION_KEY`, base64 32 bytes); without the
  key, connecting fails safely. Disconnect discards stored tokens.
- **CSRF** via signed state; **SSRF** avoided (no user-controlled URLs); **XSS** — external content is
  treated as untrusted (rendered through React; no raw HTML injection; HTML email sanitization is a
  requirement for the deferred Gmail connector).
- **Owner isolation** — every record is `user_id`-scoped with composite FKs; identity is from the
  session; client-supplied owner/account ids are ignored.
- **Audit** — `integration_connection.connected/reauthorized/disconnected/sync_completed/sync_failed`,
  `integration_resource_link.linked/unlinked` — never with tokens.
- **Rate limits** — provider 403/429 responses are detected and surfaced as `degraded`; PEOS does not
  retry aggressively. Integration endpoints use the `integration` limiter (60/min).

## Synchronization & provenance

- `IntegrationSyncState` tracks per-connection, per-resource status (idle/running/success/partial/
  failed), timestamps, records fetched/updated/failed and last error. A failed sync is never success.
- Every externally sourced record carries provenance: `sourceProvider`, `externalId`,
  `externalRef` (e.g. `github:repository:123`), `sourceUrl`, `observedAt`, `lastSyncedAt`. GitHub's
  own timestamps are kept distinct from PEOS observation time.
- Freshness is shown in the UI ("Fetched live …"); data is never silently presented as current.

## MCP boundary

The connector abstraction can host a future MCP adapter, but no MCP marketplace is built. Any MCP
operation must respect owner isolation, a tool allow-list, input/output validation, provenance, audit
and rate limits, with no direct DB or token access. MCP tool responses are untrusted input.

## Extending with a new connector

1. Add a `ProviderDefinition` to `providers.ts` (scopes with purpose/write, resources, endpoints).
2. Add the OAuth client to `config.ts` and the env vars.
3. Implement an adapter (injectable fetch) + a read service that normalizes to DTOs + provenance.
4. Add routes under `/api/v1/<provider>` and UI; cover with mock-adapter tests.
5. Add an ADR if the decision is architectural.

## Environment variables

| Variable                               | Purpose                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `INTEGRATION_ENCRYPTION_KEY`           | base64 32-byte AES-256 key for token encryption (required for any connector) |
| `GITHUB_INTEGRATION_CLIENT_ID`         | GitHub OAuth app client id (scopes `read:user`, `repo`)                      |
| `GITHUB_INTEGRATION_CLIENT_SECRET`     | GitHub OAuth app client secret                                               |
| `GITHUB_INTEGRATION_REDIRECT_URI`      | `<APP_URL>/api/v1/integrations/callback/github`                              |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | Google OAuth (deferred; Gmail scopes need a verified consent screen)         |

Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

## Local development setup

1. Register a GitHub OAuth app (Settings → Developer settings → OAuth Apps). Authorization callback
   URL = `http://localhost:3100/api/v1/integrations/callback/github`. Scopes are requested at connect
   time (`read:user`, `repo`).
2. Put `GITHUB_INTEGRATION_*` and `INTEGRATION_ENCRYPTION_KEY` in `.env`.
3. `pnpm db:deploy`, start the app, open `/settings/integrations`, Connect GitHub.

## Known limitations (this phase)

- Google (Gmail/Drive/Calendar) and MCP are deferred; GitHub is read-only (no provider mutations).
- Repository text search/filters apply within the fetched page (GitHub `/user/repos` has no query).
- No live provider validation was run in CI (no OAuth app); automated tests use mocked adapters.
