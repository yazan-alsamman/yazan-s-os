# ADR 0052 — Integration platform: connector architecture, token encryption, external identity

**Status:** Accepted · 2026-10-04 · Phase 9.5

## Context

Phase 9.5 connects PEOS to external systems (GitHub now; Google/MCP later) without making PEOS a
copy of those systems. External providers remain authoritative; PEOS stores connection metadata,
encrypted tokens, sync state, normalized external-resource metadata and explicit owner-controlled
links. It must be extensible (add a connector without redesigning the hub), owner-isolated,
auditable and secure.

## Decision

1. **A dedicated integration module** (`src/modules/integrations`), not integration logic scattered
   across domains. Provider-neutral core (crypto, oauth, oauth-state, registry, provenance,
   connection service) + per-provider adapters (`github/`). A new connector = a registry entry + an
   adapter; the hub is unchanged.
2. **Connector registry** (`providers.ts`) — non-secret definitions: provider, display name, auth
   type, documented scopes (with purpose and write flag), resources, mutations, endpoints, and a
   `status` (`available` = implemented; `scaffolded` = boundary only, deferred). GitHub is available;
   Google is scaffolded.
3. **Connection model** — `IntegrationConnection` is an authenticated owner↔provider-account
   relationship with a controlled status enum (connected/degraded/error/expired/revoked/
   disconnected), granted scopes, capabilities, sync timestamps and last error. Owner-scoped by
   composite unique `(id, user_id)` and `(user_id, provider, external_account_id)`.
4. **Token encryption at rest** (`crypto.ts`) — AES-256-GCM with a random 12-byte IV per secret,
   keyed by `INTEGRATION_ENCRYPTION_KEY` (base64, 32 bytes). Tokens are decrypted only server-side to
   make provider calls; they are **never** returned by the API, logged, put in analytics or sent to
   the AI. DTOs exclude token columns. Without the key, connecting fails safely
   (`INTEGRATION_NOT_CONFIGURED`) — no insecure development fallback.
5. **External resource identity** — provider-native ids only (`IntegrationExternalResource.externalId`
   = GitHub repo id, etc.), never names. A stable reference (`github:repository:123`) and provenance
   (source, external id, source URL, observed/synced times) accompany every externally sourced record.
   GitHub's own timestamps are kept distinct from PEOS's observation time. External ids are never
   fabricated.
6. **Normalized, bounded storage** — repository metadata is cached as external resources (for linking
   and freshness); PEOS never copies full repositories, commit trees, or (future) email bodies. Reads
   are paginated and bounded.
7. **Explicit, owner-controlled links** — `IntegrationResourceLink` ties an external resource to a
   PEOS project only when the user links it; nothing is linked by name or inference. Links are
   owner-scoped, unique, removable and audited.
8. **Owner isolation & audit** — every table carries `user_id` with composite FKs; every query is
   session-scoped; `userId`/`ownerId`/external-account ids from the client are never trusted. Connect,
   disconnect, reauthorize, sync and link/unlink are audited (never with tokens).

## Consequences

PEOS gains a durable, extensible integration layer with provider-native identity, encrypted
credentials and strict ownership — without becoming a second source of truth. Adding Google or an MCP
connector is localised. Secrets never leave the server. See [[0053-integration-oauth-and-mcp-boundary]],
[[0003-user-ownership-model]], [[0007-chart-library-echarts]].
