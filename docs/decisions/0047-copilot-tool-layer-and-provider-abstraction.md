# ADR 0047 — Copilot tool layer, provider abstraction and retrieval-only mode

**Status:** Accepted · 2026-10-03 · Phase 8

## Context

The Copilot needs to read PEOS data safely and, optionally, call an external model. `06_AI_COPILOT.md` requires a
controlled tool layer (the model never gets DB access or arbitrary SQL), authoritative reuse (no
metric drift), and that the system work with no model configured. Provider credentials must never be
persisted or logged.

## Decision

### Tool layer (`copilot.tools.ts`)

1. **Twelve tools, each wrapping an authoritative service:** `searchProjects`, `getProject`,
   `searchSkills`, `getSkill`, `searchEvidence`, `getCareerMetrics`, `getProjectMetrics`,
   `getAIExperiments`, `getGoals`, `getCertifications`, `searchTechnologies`,
   `getArchitectureDecisions`. No tool computes its own metric; derived values come from the metric
   catalogue via the analytics services, carrying their `MetricResult` state (`ok`/`zero`/`no_data`/
   `insufficient_data`/`unavailable`) unchanged.
2. **Provenance.** Each result is a list of `Source` objects `{ ref, type, id, label, href, origin,
fields }`. `origin` is `record` (a stored row) or `derived` (a metric). Metric sources carry the
   definition/formula and a drill-down `metricHref`. Output is bounded: ≤ 10 items and truncated
   text per field, with an explicit `limitation` when more records exist than were returned.
3. **Security boundary (`executeTool`).** Validates the tool name (unknown → `rejected`) and the
   input against a strict schema (invalid → `rejected`) **before** any DB access; runs as the
   session user; maps `NOT_FOUND` to a neutral "Record not found" so existence is never leaked
   across users. Every call is persisted as a `CopilotToolCall` row (tool, input, status, result
   count, duration, error) — the required audit of AI tool use.

### Provider abstraction (`src/lib/ai`)

4. **Interface, not vendor.** `ModelProvider { name, model, generate(request) }` is the only thing
   the Copilot depends on. `ProviderResponse` carries usage (`inputTokens`/`outputTokens`) exactly
   as reported — `null` when not reported, never estimated — plus latency and a request id.
5. **OpenAI-compatible adapter.** One generic Chat Completions adapter (hosted or local): no SDK,
   `temperature 0`, `response_format json_object`, an `AbortController` timeout, and typed errors
   (`timeout`, `rate_limited`, `invalid_response`, `refused`, `failed`). `fetchImpl` is injectable so
   the contract is unit-tested without a network.
6. **Server-only secrets.** `getModelProvider()` reads `AI_API_KEY` on the server and passes it only
   to the adapter; it is never stored, logged or returned. `getModelStatus()` exposes only
   `{ available, provider, model }`.
7. **Retrieval-only mode.** `AI_PROVIDER=none` (the default) means no provider: the Copilot answers
   deterministically from tool results. Env validation requires `AI_BASE_URL` + `AI_MODEL` when a
   provider is selected.

## Consequences

The model is fully replaceable and entirely optional. Tests run a deterministic stub provider; CI
runs retrieval-only. Adding a tool or a provider is a localised change behind these interfaces. See
[[0046]], [[0048]].
