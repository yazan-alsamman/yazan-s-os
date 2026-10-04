# Backup & Restore

_Phase 12 production hardening · see [ADR 0058](../decisions/0058-operational-hardening.md)._

PEOS persists all durable state in PostgreSQL (Redis holds only caches, rate-limit counters and the
BullMQ queue; S3/object storage, when configured, holds uploaded evidence files). A PostgreSQL backup
plus the object store is therefore sufficient to recover the system.

## What is backed up

- **PostgreSQL** — the single source of truth (all tables; 59 at time of writing). Logical backup via
  `pg_dump` custom format (`-Fc`): compressed, consistent (MVCC snapshot, non-blocking), and supports
  selective/parallel restore.
- **Object storage** (if configured) — evidence files are referenced by URL; back these up with the
  bucket's own versioning/lifecycle. Not covered by the DB dump.
- **Not backed up** (reconstructable): Redis cache, the Next build, `node_modules`.

## Scripts

- `scripts/backup.sh` — `DATABASE_URL=… ./scripts/backup.sh [OUT_DIR]`. Writes
  `peos-<db>-<UTCts>.dump`, verifies the archive is readable (`pg_restore --list`), and prunes local
  artifacts older than `RETENTION_DAYS` (default 14).
- `scripts/restore.sh` — `TARGET_DATABASE_URL=… ./scripts/restore.sh <dump>`. Refuses to run without an
  explicit `TARGET_DATABASE_URL`, so a restore never silently overwrites the live database.

Both require the PostgreSQL client tools (`pg_dump`/`pg_restore`, v17 to match the server). On the
pm2/VPS host install `postgresql-client`; locally they are available inside the Postgres container
(`docker exec peos-postgres-1 …`).

## Recommended schedule (production)

| Aspect         | Policy                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------- |
| Frequency      | Daily full `pg_dump` (cron), plus a manual backup immediately before every deploy/migration |
| Retention      | 14 local + 30 days off-host (object store with lifecycle expiry)                            |
| Encryption     | Encrypt at rest off-host (object-store SSE or `age`/`gpg`); dumps contain personal data     |
| Access control | Backup bucket is private, least-privilege credentials, separate from app runtime creds      |
| Verification   | `pg_restore --list` on every backup (in `backup.sh`); monthly full restore test (below)     |
| Offsite        | At least one copy off the application host                                                  |

RPO target: ≤ 24h (daily) / ≤ last pre-deploy backup. RTO target: ≤ 30 min (see
[DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)).

## Restore validation (run after every restore)

1. `pg_restore --list <dump>` succeeds (archive intact).
2. Table count matches expectation (`SELECT count(*) FROM information_schema.tables WHERE
table_schema='public'`).
3. Representative row counts are present (`users`, `projects`, `evidence`, `opportunities`).
4. Relationship integrity: owner-scoped join returns no orphans, e.g.
   `SELECT count(*) FROM project_skills ps LEFT JOIN projects p ON p.id=ps.project_id WHERE p.id IS NULL` → 0.
5. The app connects to the restored DB (`/api/health` → `database: healthy`).
6. A critical read path works (sign in, load `/command-center`, list projects).

## Verified restore test (local, isolated — 2026-10-04)

Performed against an **isolated** PostgreSQL 17.10 instance (the local Docker container), never
production:

- **Backup**: `pg_dump -Fc` of the dev database → custom-format artifact (~200 KB).
- **Archive readable**: `pg_restore --list` succeeded.
- **Restore**: into a fresh `peos_restore_verify` database — completed in **~1.9 s**, `--exit-on-error`
  clean.
- **Schema**: **59** public tables present.
- **Relationship integrity**: `project_skills → projects` orphan count = **0**.
- **Record + relationship round-trip**: seeded a related dataset (user → skill → evidence →
  skill_evidence), backed it up, restored into a second fresh database, and a 4-way owner-scoped join
  returned exactly **1** row — records and relationships survived intact.
- **Connectivity**: the restored database answered `SELECT 1` (health probe path).
- Throwaway databases and dump files were dropped/removed afterwards.

**Scope:** VERIFIED in an isolated local environment. Production disaster recovery (off-host artifact,
real credentials, full app cutover) is **UNVERIFIED** until exercised against production infrastructure.
