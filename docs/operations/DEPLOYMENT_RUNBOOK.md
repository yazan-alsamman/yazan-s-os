# Deployment Runbook

_Phase 12 · PEOS runs as a single Next.js (standalone) process under pm2 behind a TLS reverse proxy;
PostgreSQL + Redis are the backing services. Deploys are driven by the idempotent `deploy.sh`._

## Architecture at a glance

- App: `next start` under pm2 (`PM2_NAME=peos`, `PORT=3005` by default), reverse-proxied over HTTPS.
- Data: PostgreSQL (source of truth), Redis (cache, rate limits, BullMQ queue), optional S3 storage.
- Config: `.env` on the host (never committed). `deploy.sh` appends missing keys, never clobbers.

## Pre-deployment

1. **Git state** — changes merged to `main`, working tree clean on the host (`git status`).
2. **CI green** — `CI` + `CodeQL` + secret-scan checks passed on the commit being deployed.
3. **Backup** — take a fresh DB backup (`scripts/backup.sh`) and confirm it is readable. Do not deploy
   a migration without a current backup.
4. **Migration review** — inspect pending migrations (`prisma migrate status`); confirm they are
   additive (see [§Migration safety](#migration-safety)).
5. **Env** — required keys present (`APP_URL`, `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`,
   `INTEGRATION_ENCRYPTION_KEY`). OAuth/AI keys optional (features degrade to "Not configured").
6. **Health baseline** — current `/api/health` is `healthy`.

## Deployment

On the host:

```bash
cd /var/www/peos.yazanalsamman.com
git pull --ff-only
bash deploy.sh
```

`deploy.sh` is idempotent and performs: pull → `pnpm install --frozen-lockfile` → `prisma generate` →
`prisma migrate deploy` (additive) → `pnpm build` → `pm2 restart --update-env` → local health check
(fails the script on a bad health response).

## Post-deployment verification

1. **Health** — `curl -fsS http://127.0.0.1:$PORT/api/health` → `status: healthy`
   (`database: healthy`). `deploy.sh` already gates on this.
2. **Smoke** — sign in; load `/command-center`; open a project; open Evidence Vault and Opportunities;
   open GitHub (honest connection state). No console/network 5xx.
3. **Logs** — `pm2 logs peos --lines 100`: structured JSON, no `request_failed` (5xx) spikes, no
   stack traces leaking to responses.
4. **Latency/errors** — spot-check a few requests; p95 should remain well under 500 ms (see
   [MONITORING.md](./MONITORING.md); measured p95 ≈ 190 ms for an authenticated list locally).
5. **Integrations** — if GitHub is connected, Settings → Integrations shows the correct sync state.

## Rollback

Application rollback (no schema change, or forward-compatible schema):

```bash
cd /var/www/peos.yazanalsamman.com
git checkout <previous-good-sha>
bash deploy.sh      # rebuilds + pm2 restart; migrate deploy is a no-op if nothing pending
```

If a **migration** caused the failure:

- Migrations are **additive** by policy, so the previous app build runs against the new schema in the
  common case — prefer application rollback first.
- Only if the schema is genuinely incompatible and cannot be rolled forward: restore the pre-deploy
  backup into a new database and repoint `DATABASE_URL` (see [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)
  §Failed migration). Never hand-edit a committed migration on a live DB.
- Decision rule: if data was written under the new schema since deploy, a restore loses it — prefer a
  forward fix unless corruption is worse.

Verify after rollback with the post-deployment checklist.

## Migration safety

- All migrations to date are additive (new tables/columns/indexes); none drop or rewrite existing
  columns destructively. CI enforces **migration drift** (`prisma migrate diff … --exit-code`) and
  applies every migration from scratch on a clean DB each run.
- Policy for future migrations: additive first (add nullable column → backfill → enforce in a later
  release); avoid long table locks; never edit an applied migration; always take a pre-migration
  backup.
