# Local infrastructure

## Scope

This project is developed and run locally. Production hosting, cloud provider selection, public DNS/TLS, and deployment automation are out of scope. Do not provision external infrastructure for this project.

## Local topology

| Environment       | Web               | API            | Database                      |
| ----------------- | ----------------- | -------------- | ----------------------------- |
| Local development | Next.js           | Fastify        | PostgreSQL via Docker Compose |
| Automated tests   | Playwright/Vitest | Injectable API | Disposable PostgreSQL         |

Never use production or personal data in local/test environments. Keep `.env` local and ignored; use `.env.example` for placeholders only.

## Container and process expectations

- Docker Compose is the supported local orchestration path.
- Pin dependencies and base-image versions; do not add cloud-only services without an explicit product decision.
- Health checks use `/health/live` and `/health/ready`.
- API shutdown handles `SIGTERM`, stops accepting requests, drains in-flight work, and closes the database pool.
- PostgreSQL data persists in the local named volume. `pnpm compose:destroy-data` is destructive and must be clearly confirmed by the operator.
- Uploaded images must use a local storage adapter and be excluded from source control; local paths must not be treated as durable backups.

## Configuration and security

- Secrets belong in ignored local `.env` files; never commit them or expose them in `NEXT_PUBLIC_*` values.
- Local origins and ports are configured explicitly. Do not weaken credentialed CORS to a wildcard.
- The activity simulator is disabled by default and must be explicitly enabled for local development.
- No Redis, cloud storage, or hosted deployment is required by the local feature set.
