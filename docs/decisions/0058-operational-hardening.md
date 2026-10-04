# ADR 0058 — Operational hardening: backups, restore, DR, and dependency exceptions

**Status:** Accepted · 2026-10-04 · Phase 12

## Context

Phases 0–11 delivered a functionally complete PEOS with strong application-layer security (owner
isolation, CSRF, rate limiting, structured redacting logs, health/readiness, stable error envelope).
Phase 12 hardens the **operational** layer: recoverability, deployment safety, monitoring and an
honest dependency-risk posture — without adding infrastructure the single-node pm2 deployment does not
need.

## Decision

1. **Logical PostgreSQL backups via `pg_dump -Fc`.** `scripts/backup.sh` creates compressed, consistent
   custom-format dumps (non-blocking snapshot, selective/parallel restore), verifies each archive is
   readable, and prunes by local retention. `scripts/restore.sh` restores into an **explicit**
   `TARGET_DATABASE_URL` only (never defaults to the live DB). PostgreSQL is the single source of truth;
   Redis is reconstructable and object storage is backed by its own versioning. Rationale over
   alternatives: no managed-backup dependency is available for this VPS, and `pg_dump` is deterministic,
   portable across PG 17 hosts, and restore-testable locally.

2. **Restore is tested, not assumed.** A real restore was executed against an isolated PostgreSQL 17
   instance: archive readability, 59-table schema, FK-orphan = 0, and a seeded user→skill→evidence→
   skill_evidence round-trip whose 4-way join survived a backup+restore into a fresh DB. Documented as
   VERIFIED-locally; production cutover remains UNVERIFIED by design (no prod access).

3. **Documented operational runbooks** under `docs/operations/` (deployment, incident response,
   disaster recovery, monitoring, backup/restore, security operations, readiness checklist) describing
   the _actual_ pm2/`deploy.sh` setup — no invented commands.

4. **Reliability targets are explicit and separated from measurements.** SLOs (availability ≥ 99.5%,
   5xx < 1%, API p95 < 500 ms, RPO ≤ 24 h, RTO ≤ 30 min) are stated as _targets_; measured results are
   labelled as local/isolated, and unmeasurable ones (production availability, dashboard LCP) are
   marked UNVERIFIED rather than claimed.

5. **Dependency-audit exceptions are explicit and justified.** CI keeps `pnpm audit --audit-level
high` as a gate. Where an advisory has no published fix and no runtime exposure (currently
   `braces`/GHSA-vfj7-8cjw-p6xm — a dev-only transitive of the ESLint tooling), it is accepted via
   `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` with a comment and a re-check note, rather than
   lowering the audit level or pinning to a non-existent version.

6. **Load testing is bounded and isolated.** `scripts/load-test.mjs` (dependency-free, fixed
   concurrency) runs against a local prod server on the test DB; production stress testing is
   forbidden by the runbooks.

## Consequences

PEOS has reproducible, tested recovery and documented operations proportionate to a single-node
private deployment, with an honest dependency posture. No new runtime infrastructure, queues, or
observability vendors were introduced. Production-only verifications (RUM, real DR cutover, external
alerting) are explicitly deferred. See [[0059-security-scanning]], [[0005-database-and-infrastructure]].
