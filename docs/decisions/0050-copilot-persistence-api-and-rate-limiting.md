# ADR 0050 — Copilot persistence, API surface and rate limiting

**Status:** Accepted · 2026-10-03 · Phase 8

## Context

Conversations, their messages and the tool calls behind each answer must be stored, owner-scoped and
auditable, and the expensive ask operation must be rate-limited. The API must follow the established
conventions (ADR 0015) and never accept identity from the client.

## Decision

1. **Data model (additive migration).** Three tables, all owner-scoped by composite unique
   `(id, user_id)` with cascade delete from the owner:
   - `copilot_conversations` — `title`, timestamps. CHECK: title not blank.
   - `copilot_messages` — `role` (`user`/`assistant`), `content?` (the question), `answer?` (the
     validated JSON answer), `mode?` (`synthesis`/`retrieval_only`), and provider usage
     (`provider`, `model`, `input_tokens`, `output_tokens`, `latency_ms`). A role-payload CHECK
     enforces that a user turn carries `content` and no `answer`/`mode`, and an assistant turn
     carries `answer` and `mode`. Usage columns are non-negative or null (never a fabricated zero).
   - `copilot_tool_calls` — `tool`, `input`, `status` (`ok`/`rejected`/`failed`), `result_count?`,
     `duration_ms`, `error?`, linked to the assistant message. This is the persisted log of AI tool
     use.
2. **Orchestration (`copilot.service.ts`).** Fixed pipeline: verify conversation ownership → route →
   execute tools as the session user → build bounded, redacted context → (optionally) generate →
   validate and build citations → persist the user turn, the assistant turn and the tool calls in one
   transaction. Provider usage is stored only when synthesis actually ran. The first question names
   the conversation.
3. **API surface (`/api/v1/copilot`).** `GET/POST /conversations`; `GET/PATCH/DELETE
/conversations/:id`; `POST /conversations/:id/ask`; `GET /status`. Uses `defineUserRoute`; a
   malformed id is a 404; identity is always `ctx.userId` from the session, never from the body. The
   ask body accepts only `{ question, task, focus?, portfolioKind? }` — closed enums for task and
   kind, a UUID for focus — so the client cannot widen scope.
4. **Rate limiting.** The `ask` endpoint uses a dedicated `copilot` policy (30 requests / 600 s per
   user) because it is expensive and may call an external model. Conversation CRUD uses the standard
   mutation limiter.
5. **Audit.** Conversation creation and deletion are audited in-transaction under the new
   `copilot_conversation` audit entity. Tool calls are recorded per message (point 1).
6. **Authorization.** A user can only see, ask within, rename or delete their own conversations;
   every other id resolves to 404 (verified by two-user HTTP and service tests).

## Consequences

Conversation history is durable, owner-isolated and inspectable; every answer carries the tool calls
and usage that produced it; the costly path is bounded. The model never influences identity, scope or
rate. See [[0046]], [[0047]], [[0048]], [[0049]].
