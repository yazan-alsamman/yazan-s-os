# Disaster Recovery

_Phase 12 · recovery procedures for PEOS. Objectives: **RPO ≤ 24 h** (last daily / pre-deploy backup),
**RTO ≤ 30 min** for a single-node restore. See [BACKUP_AND_RESTORE.md](./BACKUP_AND_RESTORE.md)._

Each scenario: **Detection → Containment → Recovery → Validation → Rollback → Follow-up.**

## 1. Database corruption / loss

- **Detection:** `/api/health` → `database: unavailable` (HTTP 503); query errors in logs; failed reads.
- **Containment:** stop writes (pm2 stop or maintenance page) to prevent further divergence.
- **Recovery:** provision a clean PostgreSQL; `TARGET_DATABASE_URL=… scripts/restore.sh <latest dump>`.
- **Validation:** BACKUP_AND_RESTORE.md §Restore validation (archive, table count, row counts, orphan
  join = 0, `/api/health`, a critical read path).
- **Rollback:** if the restored data is older than acceptable, choose a different backup generation.
- **Follow-up:** root-cause (disk, OOM, bad migration); verify backup freshness; record timeline.

## 2. Failed migration

- **Detection:** `deploy.sh` fails at `prisma migrate deploy`; app may be down or in a mixed state.
- **Containment:** do not retry blindly; capture the migration error and `prisma migrate status`.
- **Recovery:** (a) if additive and partially applied, fix forward with a corrective migration; (b) if
  the schema is unusable, restore the pre-deploy backup into a new DB and repoint `DATABASE_URL`.
- **Validation:** `prisma migrate status` clean; health healthy; smoke tests pass.
- **Rollback:** application rollback to the previous SHA (migrations are additive → usually
  compatible).
- **Follow-up:** add the failing case to the migration test; never edit an applied migration in place.

## 3. Bad deployment (app broken, schema fine)

- **Detection:** post-deploy smoke fails; elevated 5xx in `pm2 logs`; health degraded.
- **Containment / Recovery:** `git checkout <previous-good-sha> && bash deploy.sh`.
- **Validation:** post-deployment checklist. **Follow-up:** reproduce in CI before re-deploying.

## 4. Application crash / process down

- **Detection:** pm2 shows the process stopped/erroring; health unreachable.
- **Recovery:** `pm2 restart peos` (pm2 also auto-restarts on crash). If it crashes on boot, inspect
  `pm2 logs peos` for a config/env error (often a missing required env var).
- **Follow-up:** fix the env/config; consider `pm2 startup` persistence.

## 5. Redis outage

- **Behavior:** Redis is **non-critical** — `/api/health` reports `degraded` (HTTP 200), the app keeps
  serving. Rate limiting and the background queue depend on Redis and will fail/no-op until it returns.
- **Recovery:** restart Redis; the app reconnects. No data loss (Redis holds only caches/counters/queue).

## 6. GitHub (or other integration) outage

- **Behavior:** by design the UI distinguishes connected / synchronized / **partially synchronized** /
  stale / degraded / failed / not connected. Analytics read local projections, so pages keep working
  with last-synced data; sync surfaces a partial/degraded banner. Unavailable external data is never
  shown as current.
- **Recovery:** re-run Sync when the provider recovers; incremental/resumable sync continues.

## 7. Object storage outage (if configured)

- **Behavior:** storage is **non-critical** (`/api/health` → `degraded`). Evidence file links may
  fail; metadata and all other features are unaffected.
- **Recovery:** restore storage connectivity; restore files from the bucket's versioning if lost.

## 8. Secret compromise

- **Detection:** gitleaks finding, leaked `.env`, or suspicious access.
- **Containment:** rotate immediately — `BETTER_AUTH_SECRET` (invalidates sessions → users re-login),
  `INTEGRATION_ENCRYPTION_KEY` (**note:** rotating it makes existing encrypted OAuth tokens
  undecryptable → users must reconnect integrations), DB/Redis credentials, OAuth client secrets.
- **Recovery:** redeploy with new secrets; revoke OAuth apps/tokens at the provider.
- **Follow-up:** confirm the secret is not in git history (gitleaks full-history scan); see
  [SECURITY_OPERATIONS.md](./SECURITY_OPERATIONS.md) §Secret rotation.

## 9. Data-integrity incident

- **Detection:** unexpected cross-owner data, orphaned relationships, duplicate records.
- **Containment:** owner isolation and composite FKs make cross-owner writes structurally impossible
  (verified by `idor.int.test.ts`); investigate before mutating.
- **Recovery:** restore the last known-good backup into an isolated DB, diff, and selectively repair.
- **Follow-up:** add a regression test reproducing the invariant violation.

## Communication (single-operator private system)

Record each incident in an incident note (see [INCIDENT_RESPONSE_RUNBOOK.md](./INCIDENT_RESPONSE_RUNBOOK.md)):
start time, detection, actions, resolution, follow-ups. There are no external SLAs; this is a private
engineering system.
