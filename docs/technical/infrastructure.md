# Infrastructure and deployment decision

## Recommendation

1. Deploy **Next.js to Vercel**.
2. Deploy the **Fastify API container to the existing DigitalOcean Droplet**, behind Caddy with automatic TLS.
3. Use **PostgreSQL**, never SQLite in production.
4. For the challenge/demo, prefer a **free managed Neon Postgres project** if third-party infrastructure is acceptable; it avoids operating the database and supplies a restore window. For a self-contained deployment, run Postgres on the Droplet with a named volume and mandatory encrypted off-host backups. Do not describe either free tier as a production SLA.

As of November 2026, Neon advertises a free Postgres tier with scale-to-zero and per-project limits; Supabase also offers free Postgres but pauses low-activity free projects and does not include automatic backups on free. Limits change, so verify the linked official pages before provisioning: [Neon plans](https://neon.com/docs/introduction/plans), [Neon pricing](https://neon.com/pricing), [Supabase pricing](https://supabase.com/pricing). Vercel environment changes apply only to new deployments: [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Why not SQLite?

SQLite is excellent for embedded/single-process software but this architecture separates web/API, uses containers, has concurrent social writes, and may add multiple API replicas. PostgreSQL gives robust concurrency, constraints, search indexes, managed-host options, and production parity in tests. The small traffic level does not remove correctness/operations needs.

## Backend hosting options

| Option | Cost/ops | Strengths | Risks | Decision |
|---|---|---|---|---|
| Existing Droplet + Docker Compose | Existing spend; team operates it | No new platform cost, full control, simple API deployment | Single node; patching, backups, monitoring are ours | **Initial API** |
| DigitalOcean App Platform | Managed and convenient | Deploy/health/log workflow | Paid service; less value while Droplet exists | Revisit when ops time dominates |
| Serverless/function API | Can be cheap at idle | Auto-scale | Cold starts, session/SSE/runtime constraints, split deployment complexity | Not initial |
| Free PaaS offers | Often $0 for demos | Fast start | Sleep/cold starts, changing limits, weak guarantees | Evaluation only |

## Environment topology

| Environment | Web | API | DB |
|---|---|---|---|
| Local | Next dev container | Fastify dev container | Compose Postgres |
| Test | built app/Test runner | injectable/container API | disposable Postgres |
| Preview | Vercel preview | isolated staging route or preview API | isolated branch/database |
| Staging | Vercel protected alias | Droplet staging container | separate DB/schema/managed branch |
| Production | Vercel production | Droplet production container | Neon managed or isolated Droplet Postgres |

Never share credentials or writable databases between environments.

## Container requirements

- Multi-stage Dockerfiles: cached dependency stage, hot-reload `development`, compile/test `build`, minimal `production`.
- Pin base image major and lockfile; production copies only runtime artifacts/dependencies.
- Run non-root, read-only root filesystem where possible, drop capabilities, use `init`, set CPU/memory limits.
- No secrets in build args/layers. Emit an SBOM and scan the final image.
- Health check uses `/health/live`; orchestrator readiness uses `/health/ready`.
- Graceful `SIGTERM`: stop accepting requests, finish in-flight work, close DB pool.

## Droplet production layout

```text
Internet → firewall (22 restricted, 80/443 public) → Caddy → API container
                                                   └→ Postgres network only (if self-hosted)
backup job → encrypted dump → off-host object storage
```

- SSH keys only; disable password/root login; unattended security updates with maintenance awareness.
- Caddy and API share a frontend network. Postgres is on a private backend network and has no public port.
- Use immutable SHA-tagged images from a registry. Do not build production source on the server.
- Persist only database/Caddy data; application containers are disposable.

## Vercel configuration

- `NEXT_PUBLIC_API_URL` is public and environment-specific; never place secrets in `NEXT_PUBLIC_*`.
- Configure production, preview, and development values separately; redeploy after changes.
- Preview deployments need an explicit API/CORS policy. Avoid allowing `*.vercel.app` blindly with credentials; provision known origins or use a same-origin proxy/BFF policy.

## Scaling trigger

Move DB to paid managed Postgres before the free tier/restore window becomes a business risk. Move API from one Droplet when sustained resource use exceeds 70%, deploy downtime violates objectives, or redundancy becomes required. Add Redis only after multiple API instances require shared rate limiting/pub-sub/cache.
