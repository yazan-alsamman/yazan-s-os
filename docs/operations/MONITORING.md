# Monitoring & Reliability Targets

_Phase 12 · what to observe in PEOS, how, and the reliability targets. PEOS is a single-node, private
system; monitoring is proportionate — no enterprise observability platform is required._

## Signals available today

| Source               | What it gives                                                                                                                                                                                                            | How                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `/api/health`        | App + dependency readiness (`database` critical; `redis`/`queue`/`storage` non-critical). 503 only when the app cannot serve. No secrets/topology leaked.                                                                | Poll from the reverse proxy / uptime check                 |
| Structured logs      | Every request: `requestId`, `route`, `method`, `status`, `durationMs`; failures as `http.request_failed` (5xx, with server-side stack) / `http.request_rejected` (4xx). Secrets/tokens/cookies redacted (pino `redact`). | `pm2 logs peos` → ship JSON to a log sink if desired       |
| OpenTelemetry traces | Per-route spans (`withSpan`), service name `OTEL_SERVICE_NAME`.                                                                                                                                                          | Set `OTEL_EXPORTER_OTLP_ENDPOINT` to export; unset = no-op |
| Request ID           | `x-request-id` on every response for correlation.                                                                                                                                                                        | Returned header + log field                                |

## What to watch

- **Application:** request rate, error rate (`status>=500`), latency (`durationMs`, p95), availability
  (`/api/health` 200 ratio). Alert when 5xx rate or p95 crosses the thresholds below.
- **Database (critical):** `/api/health` `database` status; `http.request_failed` with DB error codes;
  connection saturation (Prisma pool) if observable. Migration state via `prisma migrate status`.
- **Background queue (BullMQ/Redis):** failed-job count and waiting depth (the health `queue` probe
  reads `getJobCounts("waiting","failed")`). Investigate growing failed counts.
- **Integrations (GitHub):** sync state is first-class in the app (connected / synchronized /
  partially synchronized / stale / degraded / failed / not connected) and in `IntegrationSyncState`
  rows (status, counts, `lastError`, pending repositories). Watch for `degraded`/`partial` persisting
  across runs and rate-limit exhaustion.
- **AI (if enabled):** provider request failures and latency appear in logs; cost/usage is provider-
  side. No AI calls occur on normal page loads.

## Reliability targets (SLOs)

Targets appropriate to a private single-node deployment. Distinguish **target** from **measured**.

| SLO                              | Target   | Window  | Measured                                                                                             |
| -------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------- |
| Availability (`/api/health` 200) | ≥ 99.5%  | 30 days | UNVERIFIED (needs production uptime data)                                                            |
| API error rate (5xx)             | < 1%     | 7 days  | Local load test: **0%** over 1,200 requests (isolated)                                               |
| Standard API latency p95         | < 500 ms | 7 days  | Local: `/api/v1/projects` p95 **≈ 189 ms**, `/api/health` p95 **≈ 161 ms** (isolated, empty dataset) |
| Dashboard LCP                    | < 2.0 s  | —       | UNVERIFIED (no production RUM/Lighthouse run this phase)                                             |
| Cached chart interaction         | < 150 ms | —       | UNVERIFIED (not instrumented)                                                                        |
| RPO (data loss)                  | ≤ 24 h   | —       | Backup cadence defined; restore VERIFIED locally                                                     |
| RTO (recovery)                   | ≤ 30 min | —       | Restore ran in ~2 s locally; full prod cutover UNVERIFIED                                            |

Error budget: at 99.5%/30 d the budget is ~3.6 h/month; at <1% 5xx/7 d, ~1 in 100 requests. Breaching
either triggers an incident (see [INCIDENT_RESPONSE_RUNBOOK.md](./INCIDENT_RESPONSE_RUNBOOK.md)).

## Alerting (recommended, not yet wired to a provider)

- Uptime check on `/api/health` every 1–5 min → alert on non-200 or `database != healthy`.
- Log-based alert on sustained `http.request_failed` rate.
- Weekly review of GitHub `IntegrationSyncState` for stuck `partial`/`failed`.

These are documented recommendations; integrating a specific alerting provider is deferred (no
external monitoring vendor is provisioned for this private system).

## Continuous Intelligence (Phase 13)

New background-style operation: the deterministic detection orchestrator (`POST
/api/v1/intelligence/run`) and the weekly executive review (`/api/v1/intelligence/weekly-review`,
generate-on-read). Both are owner-scoped, idempotent and audited (`intelligence_signal.generated`,
`evidence_candidate.accepted/rejected`, `weekly_review.generated`).

- **What to watch:** run frequency and failures in the structured logs (`route:
v1.intelligence.run`), signal volume and resolution rate (active vs resolved in
  `intelligence_signals`), evidence-candidate acceptance rate, and weekly reviews stuck in `partial`
  (data-coverage issues, usually a stale GitHub sync).
- **Failure behaviour:** detection is deterministic DB work — if a query fails the run errors and is
  retried by the caller; no signal is lost (reconciliation is idempotent). No AI provider is on the
  detection path, so provider outages cannot block intelligence. If GitHub is unavailable/stale, the
  weekly review is marked `partial` rather than concluding "no activity".
- **Scheduling:** the orchestrator + weekly generator are designed to be driven periodically by the
  existing BullMQ queue (`src/lib/queue`). Phase 13 triggers them on demand (owner-initiated, rate-
  limited); wiring a periodic worker (e.g. a daily `run` + Monday `weekly-review` per owner) is a
  deployment step and is **not** yet enabled. Because both are idempotent, a double-fire never
  duplicates signals, candidates or reviews.
- **Retention:** signals and candidates are bounded per owner by deduplication (one row per
  condition/source); resolved signals remain for history. A future retention job may archive resolved
  signals and old weekly reviews; not required for current data volumes.
