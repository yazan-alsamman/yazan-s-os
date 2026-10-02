# ADR 0006 — Background jobs with BullMQ on Redis

**Status:** Accepted · 2026-10-02

## Context

`03` §1 requires _"Redis + queue system, or managed equivalent"_ for scheduled analytics, AI jobs,
document ingestion and notifications. `03` §7 also says background analytics must not block UI
rendering.

## Decision

- **BullMQ 6** with **ioredis 6** connections (`maxRetriesPerRequest: null`, as BullMQ requires).
- A queue registry in `src/lib/queue/queues.ts` declares every queue name in one place. Phase 0
  declares only `peos-system`, which the health check uses.
- Default job policy: 3 attempts, exponential backoff starting at 5 seconds. Completed jobs are kept
  for 24 hours (maximum 1,000); failed jobs for 7 days.
- `createWorker()` exists for later phases. Workers will run as a **separate Node process**, not
  inside the Next.js server. No workers exist in Phase 0.

## Alternatives considered

- _pg-boss / Graphile Worker (Postgres-backed):_ one less moving part, but `03` names Redis, and
  BullMQ's schedulers, rate limiters and flows fit analytics fan-out.
- _Managed queues (SQS, Cloud Tasks):_ this ties PEOS to a cloud vendor before a hosting decision
  exists.

## Consequences

- Redis is a runtime dependency. Health reports `degraded` (not `unavailable`) when Redis is down,
  because request serving can continue without it.
- The optional native accelerator `msgpackr-extract` is deliberately not built
  (`allowBuilds: false`). BullMQ falls back to pure JavaScript.
- A worker entrypoint, its deployment unit and per-queue observability arrive with the first real
  job (Phase 2 analytics or Phase 1 imports).
