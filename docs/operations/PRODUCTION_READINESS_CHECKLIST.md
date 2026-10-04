# Production Readiness Checklist

_Phase 12 · status as of 2026-10-04. Legend: ✅ verified (locally / isolated), ☑️ implemented &
documented, ⏳ environment-dependent / unverified in this environment._

## Security

- ✅ Authentication enforced (`requireApiUser`; anonymous → 401)
- ✅ Session cookies `httpOnly` + `SameSite=Lax`; DB-backed validation; `secure` in prod
- ✅ Authorization / owner isolation (service + composite FKs; cross-owner → 404) — `idor`/`*-authz`
- ✅ CSRF defense-in-depth (same-origin check on mutations)
- ✅ XSS (escaped React text; no dangerous HTML on user/GitHub content)
- ✅ SSRF posture (no server-side fetch of user URLs; http(s) allowlist)
- ☑️ File security (evidence files are validated external URLs; no local upload-execution path)
- ✅ Rate limiting (per-user mutations + per-endpoint policies)
- ✅ Secret hygiene (`.env` gitignored/untracked; local scan clean; gitleaks in CI)
- ✅ Dependency audit (high+ gate; 1 documented dev-only exception)
- ☑️ SAST (CodeQL in CI; runs GitHub-side)

## Reliability

- ✅ Health endpoint (DB critical; redis/queue/storage non-critical; 503 semantics; no leakage)
- ✅ Readiness (same endpoint distinguishes healthy/degraded/unavailable)
- ✅ Database integrity (constraints, composite FKs, unique keys, cascades) — migration drift gate in CI
- ☑️ Migration safety policy (additive; from-scratch apply + drift check in CI)
- ☑️ Backup strategy (`scripts/backup.sh`; schedule/retention/encryption documented)
- ✅ Restore test (isolated PostgreSQL 17; schema + seeded record/relationship round-trip)
- ☑️ Disaster recovery procedures (9 scenarios)

## Observability

- ✅ Structured logs (pino JSON; request id/route/status/duration; secrets redacted)
- ✅ Request correlation (`x-request-id` on every response)
- ☑️ Tracing (OpenTelemetry spans per route; exporter via `OTEL_EXPORTER_OTLP_ENDPOINT`)
- ☑️ Error envelope (stable code/message/requestId; no stack/DB leakage)
- ⏳ Error tracking provider (strategy documented; no external provider provisioned — logs + OTEL)
- ☑️ Monitoring plan + alert recommendations

## Performance

- ✅ Load test (isolated; `/api/health` p95 ≈ 161 ms, `/api/v1/projects` p95 ≈ 189 ms, 0 errors / 1,200 req)
- ✅ API p95 < 500 ms (local, isolated, empty dataset)
- ⏳ Dashboard LCP < 2.0 s (needs production RUM/Lighthouse)
- ⏳ Cached chart interaction < 150 ms (not instrumented)

## Deployment

- ☑️ CI (install/lockfile, prisma validate, format, lint, typecheck, unit, build, audit; migrations
  from scratch + drift, integration, E2E) + secret-scan + CodeQL
- ☑️ Deployment runbook (idempotent `deploy.sh`: pull → install → migrate → build → pm2 → health)
- ☑️ Rollback procedure (app rollback; migration/restore decision rule)
- ✅ Smoke/health gate in `deploy.sh`

## Operations

- ☑️ Incident response runbook (severities + per-incident)
- ☑️ Disaster recovery runbook
- ☑️ Monitoring + error-budget/SLO targets (target vs measured distinguished)
- ☑️ Environment separation (dev/test/prod; test DB isolated; ephemeral CI secrets; `.env` untracked)

## Known environment-dependent gaps (⏳)

Production availability/RUM, an external error-tracking/alerting provider, and a production disaster-
recovery cutover require production infrastructure and are not verifiable in this environment. See the
Phase 12 report §Known Limitations.
