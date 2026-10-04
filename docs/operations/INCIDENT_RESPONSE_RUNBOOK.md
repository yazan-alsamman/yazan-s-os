# Incident Response Runbook

_Phase 12 · PEOS is a private, single-operator system. Severities and responses are proportionate;
there are no external customers or contractual SLAs. Recovery mechanics live in
[DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)._

## Severity levels

| Sev      | Meaning                                       | Examples                                                                            | Response expectation         |
| -------- | --------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| **SEV1** | System unusable or data at risk               | DB down/corrupt, auth broken for everyone, secret compromise, data-integrity breach | Drop everything; contain now |
| **SEV2** | Major feature broken / degraded, no data risk | Elevated 5xx, high latency, failed deploy, GitHub sync failing                      | Same day                     |
| **SEV3** | Minor/localized, workaround exists            | One screen erroring, slow query, cosmetic                                           | Scheduled                    |

## General flow

1. **Detect** — alert, failed health check, or observed error. Note the time.
2. **Triage** — assign severity; check `/api/health` and `pm2 logs peos --lines 200` (filter by
   `requestId` / `http.request_failed`).
3. **Contain** — stop the bleeding (pm2 stop, roll back deploy, rotate a secret, block writes).
4. **Recover** — apply the matching DISASTER_RECOVERY procedure.
5. **Validate** — post-deployment / restore validation checklist.
6. **Document** — write an incident note (template below).

## Per-incident quick reference

- **Authentication outage** (SEV1): check DB health (sessions are DB-backed); if `BETTER_AUTH_SECRET`
  changed unexpectedly, all sessions invalidate (users re-login) — confirm the env is correct and
  consistent across restarts. Recover DB if that is the cause.
- **Database outage** (SEV1): DISASTER_RECOVERY §1. Health shows `database: unavailable` → 503.
- **Elevated error rate** (SEV2): identify the failing route from logs (`route`, `status`); if
  deploy-induced, roll back; if data-induced, inspect the specific records.
- **High latency** (SEV2): check DB (slow queries / saturation), Redis availability; compare against
  the p95 budget in [MONITORING.md](./MONITORING.md).
- **Failed deployment** (SEV2): DEPLOYMENT_RUNBOOK §Rollback.
- **Data corruption** (SEV1): DISASTER_RECOVERY §9; restore to isolated DB and diff before repair.
- **Security incident / secret compromise** (SEV1): [SECURITY_OPERATIONS.md](./SECURITY_OPERATIONS.md)
  §Secret rotation + DISASTER_RECOVERY §8; rotate, redeploy, revoke provider tokens.
- **Third-party integration outage** (SEV2/3): expected-degraded by design; the UI shows partial/stale
  state. Re-sync on recovery. Do not treat stale external data as current.

## Incident note template

```
Incident: <short title>        Severity: SEV<n>
Detected: <UTC>   By: <alert/observation>
Impact: <what was broken, who/what affected>
Timeline:
  <ts> detected … <ts> contained … <ts> recovered … <ts> validated
Root cause: <...>
Fix / recovery: <commands, backup generation used, rollback SHA>
Follow-ups: <regression test, config change, monitoring gap>  (tracked: yes/no)
```

Store notes under `docs/operations/incidents/` (create as needed) or the project tracker.
