# Operations runbook

This is the target production runbook. Commands marked **M1/M6** must be implemented and rehearsed before launch; they are not claimed to work in the current planning-only repository.

## Service inventory

| Service                | Owner                               | Health                          | State              |
| ---------------------- | ----------------------------------- | ------------------------------- | ------------------ |
| Vercel web             | Product engineering                 | public page + synthetic journey | disposable build   |
| Droplet Caddy/API      | Backend/on-call                     | `/health/live`, `/health/ready` | stateless          |
| PostgreSQL             | Backend/on-call or managed provider | connection/query probe          | durable, backed up |
| Object storage (bonus) | Backend/on-call                     | provider metrics                | durable            |

Record production URLs, Droplet ID/IP, registry, database provider/project, backup bucket, dashboards, and escalation contacts in the private operator system—not in this public document.

## Release checklist

1. CI green for exact commit; image vulnerability policy passes; image digest recorded.
2. Required env schema validated; secrets are present but never printed.
3. Recent backup succeeded and restore verification is within policy.
4. Migration reviewed for locks/data impact; rollback or forward-fix chosen.
5. Previous image digest and Vercel deployment are known.
6. Announce change window; run migration one-shot job.
7. Pull/promote immutable API image, `docker compose -f compose.yaml -f compose.prod.yaml up -d` (**M6**).
8. Wait for readiness; promote Vercel deployment.
9. Run smoke: health, login, timeline read, create/delete dedicated smoke tweet (**M6 script**).
10. Observe error rate, p95 latency, DB connections/disk, CPU/memory for at least 15 minutes.

## Rollback

1. Stop rollout and capture logs/request IDs; do not destroy containers/volumes.
2. If schema remains backward-compatible, redeploy previous API image digest and promote previous Vercel deployment.
3. If migration is incompatible, prefer the pre-reviewed forward fix. Restore is last resort because it loses writes up to the recovery point.
4. Smoke test and monitor. Open incident/postmortem and document data impact.

## Database backup (self-hosted option)

Target implementation (**M6**): daily custom-format `pg_dump`, compressed/encrypted client-side, uploaded off-host, checksum recorded; retain 7 daily and 4 weekly backups. Alert if job age exceeds 26 hours. A backup is not successful until it can be listed, decrypted, and restored during a drill.

Conceptual commands (operators must use scripts that avoid secrets in process lists/history):

```bash
pg_dump --format=custom --no-owner --file=backup.dump "$DATABASE_URL"
pg_restore --list backup.dump >/dev/null
```

### Restore drill

1. Create an isolated empty database with no route from production traffic.
2. Download and verify checksum; decrypt backup.
3. `pg_restore --clean --if-exists --no-owner` into the isolated DB.
4. Run migrations only if testing restore-to-current compatibility.
5. Verify schema version, user/tweet/follow/like counts, foreign keys, and a sample timeline query.
6. Record duration (RTO), backup age (RPO), result, and safely destroy drill resources.

Never overwrite production as a “test.”

## Incident triage

### API unavailable / 5xx spike

1. Confirm externally and check Vercel vs API boundary; inspect liveness/readiness.
2. Check latest release, container state/restarts, CPU/memory/disk, Caddy/API logs by request ID.
3. Check DB reachability/pool saturation and provider status.
4. Mitigate: rollback recent release; restart only if cause is understood or restoration is urgent; scale/block abusive traffic as appropriate.
5. Communicate scope and timestamps. Preserve evidence.

### Database disk high

1. Verify whether database, WAL, logs, or Docker artifacts consume disk.
2. Stop nonessential writes if exhaustion is imminent. Never delete database/WAL files manually.
3. Expand storage or migrate; safely prune confirmed-unused images/logs under retention policy.
4. Validate DB and backups; adjust alert thresholds/capacity plan.

### Login failure spike

1. Compare `401`, `403/CSRF`, `429`, and `5xx`; check cookie domain/Secure/SameSite and CORS after deployments.
2. Verify clock, session expiry, Argon2 capacity, DB pool, and secret version alignment.
3. If credential attack suspected, tighten rate limits and investigate privacy-safe signals without leaking account existence.

### Suspected secret compromise

1. Declare incident; restrict access; preserve audit evidence.
2. Rotate affected secret/provider credential. Session-secret compromise requires revoking all sessions.
3. Redeploy dependent services; verify old credentials fail.
4. Review logs for abuse and notify affected parties according to policy/law.

## Alerts (initial)

- Synthetic availability fails twice in 5 minutes.
- API 5xx >2% for 5 minutes; p95 >500 ms for 10 minutes.
- DB connections >80%, disk >75% warning / >85% critical.
- Container restart loop; host disk >80%; TLS expiry <21 days.
- Backup older than 26 hours or restore drill overdue.

Every alert links to this runbook, has an owner, and is tested before launch. Avoid alerts without a concrete operator action.

## Maintenance

- Weekly: review errors, dependency/container alerts, disk/capacity.
- Monthly: restore drill, access review, OS/container patching, alert test.
- Quarterly: incident exercise, RPO/RTO review, secret rotation policy check, dependency major-version plan.

## Incident closeout

Document timeline, customer/data impact, root cause, contributing factors, detection gaps, resolution, and owned/due corrective actions. Focus on system improvement, not blame.
