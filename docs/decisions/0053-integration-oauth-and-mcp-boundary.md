# ADR 0053 — Integration OAuth flow, mutation confirmation, and the MCP boundary

**Status:** Accepted · 2026-10-04 · Phase 9.5

## Context

Connecting a provider uses OAuth 2.0, which has well-known risks (CSRF, open redirects, SSRF, token
leakage). Phase 9.5 must also keep external mutations safe and leave an architectural boundary for
future MCP-compatible providers without granting them unrestricted access.

## Decision

1. **Authorization-code flow with signed state** (`oauth-state.ts`). The `state` is an HMAC
   (keyed by `BETTER_AUTH_SECRET`) over `{ userId, provider, nonce, exp }`. The callback verifies the
   signature, the expiry, and that the **session user matches the embedded userId** — so a forged or
   replayed state, or a state minted for another user (login CSRF), cannot connect an account to the
   wrong owner. State TTL is 10 minutes.
2. **No user-controlled URLs (SSRF defence).** Authorize, token and identity endpoints come only from
   the trusted connector registry (`providers.ts`); the callback resolves them by provider enum, never
   from request input. The redirect URI is server-configured.
3. **Token handling.** The code→token exchange and identity lookup run server-side with an injectable
   fetch (unit-tested). Tokens are encrypted immediately (ADR 0052) and never reach the browser.
   Provider/token errors map to neutral PEOS error codes (`INTEGRATION_AUTH_FAILED`,
   `INTEGRATION_RATE_LIMITED`, `INTEGRATION_PROVIDER_UNAVAILABLE`, …) that never leak provider
   internals; the OAuth callback redirects to an explained settings state.
4. **Connection health reflects reality.** Auth failures mark a connection `expired`; rate limits mark
   it `degraded` with the last error; a failed sync is recorded as `failed` (never silent success).
   Disconnect discards tokens and stops syncing while preserving audit history.
5. **Mutation confirmation policy.** Reads require no confirmation. External mutations (future: send
   email, create/update calendar events, archive) must be explicit user actions with a confirmation
   that states what will happen, to which account and resource — and never happen as a side effect of
   reading or from an AI suggestion without explicit user confirmation. Phase 9.5 implements only the
   owner-controlled PEOS-side link mutation (repository ↔ project); no external-provider mutation is
   implemented yet.
6. **MCP boundary (architecture only).** The connector abstraction is capable of hosting an MCP
   adapter, but no MCP marketplace is built in Phase 9.5. Any future MCP-originated operation must go
   through the same controls as every connector: owner isolation, a capability/tool allow-list,
   input/output validation, provenance, audit, rate limits — and **no** direct database or token
   access. External tool responses are untrusted input, exactly like email/README/issue text, and may
   never override PEOS or AI-Copilot system instructions.
7. **Independence.** PEOS does not depend on any AI product's connector catalog being installed or
   available; connectors are PEOS-owned OAuth/REST adapters. External connector availability is
   provider-dependent and documented.

## Consequences

The OAuth flow is CSRF/SSRF-resistant and leak-resistant; health is honest; mutations are explicit and
owner-driven; and MCP can be added later within the same security envelope rather than as a privileged
back door. See [[0052-integration-platform]], [[0046-copilot-architecture-and-grounding]],
[[0009-security-headers-csp]].
