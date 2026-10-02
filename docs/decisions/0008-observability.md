# ADR 0008 — Provider-neutral observability

**Status:** Accepted · 2026-10-02 (exporter decision deferred)

## Context

`03` §1 asks for OpenTelemetry, structured logs, error tracking and performance monitoring. `09`
Rule 8 says important background jobs and AI calls must be traceable. No hosting target or
observability vendor has been chosen.

## Decision

- **Structured logs:** pino, JSON to stdout. Fields: `time` (ISO), `level`, `service`, `message`,
  plus context. Every API request logs `requestId`, `route`, `method`, `status` and `durationMs`.
  Credentials, tokens, cookies and auth headers are redacted at the logger (unit-tested).
- **Request IDs:** assigned or propagated in `src/proxy.ts` (`x-request-id`; inbound values are
  accepted only if they match a safe pattern), returned on every response and included in every
  error envelope.
- **Errors:** a single `AppError` catalogue maps to HTTP status and a public message. Unknown
  errors are logged with their stack and returned as `INTERNAL_ERROR` with no detail.
- **Tracing:** application code depends only on `@opentelemetry/api` (`withSpan`). Without a
  registered SDK, spans are no-ops. `src/instrumentation-node.ts` is the single registration point
  for an SDK/exporter.
- **Exporter/vendor deferred:** `OTEL_EXPORTER_OTLP_ENDPOINT` is reserved. When a collector exists,
  register `@opentelemetry/sdk-node` with an OTLP exporter there. Call sites stay unchanged.

## Alternatives considered

- _`@vercel/otel` now:_ requires six additional OpenTelemetry SDK peer packages with nothing to
  export to. Deferred.
- _A vendor SDK (Sentry, Datadog) now:_ premature without a hosting decision, and sends data to a
  third party.

## Consequences

- Logs are production-ready today. Traces become useful as soon as an exporter is registered.
- Error tracking (aggregation and alerting) and metrics are Phase 12 work, or earlier if the
  hosting decision lands sooner.
