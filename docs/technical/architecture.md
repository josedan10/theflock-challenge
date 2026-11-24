# Technical architecture

## Decision summary

Use a TypeScript monorepo with a Next.js web app, a stateless Fastify REST API, and PostgreSQL. Deploy web to Vercel and the containerized API to the existing DigitalOcean Droplet behind Caddy. Keep PostgreSQL in Compose for local development; production may initially use a hardened Postgres container on the Droplet with encrypted off-host backups, with a documented migration path to managed Postgres.

## Why this shape

- **Separate API** makes the backend deployable and testable independently and supports future mobile clients/SSE.
- **Fastify** is small, schema-friendly, performant, and less ceremonial than a large framework for this scope.
- **PostgreSQL over SQLite** provides safe concurrent writes, case-insensitive/indexed search options, mature constraints, and a clean path beyond one process. SQLite would simplify a single-node prototype but makes container persistence, concurrent writes, scaling, and operational migration harder.
- **Drizzle** keeps schema and queries close to SQL while providing TypeScript inference and explicit migrations.
- **Shared Zod contracts** reduce client/API validation drift, without sharing persistence models.

## Logical view

```text
Browser
  │ HTTPS (session cookie, CSRF header)
  ├──────────────► Vercel / Next.js web
  │
  └──────────────► api.example.com / Caddy
                         │
                         ▼
                   Fastify API container
                    │              │ future
                    ▼              └──► S3-compatible object storage
                 PostgreSQL
```

Prefer `app.example.com` and `api.example.com` so the deployment remains same-site. CORS allows only known web origins, including explicit preview policy. Do not use wildcard origins with credentials.

## Proposed repository

```text
apps/
  api/                  Fastify composition, HTTP adapters, migrations entrypoint
  web/                  Next.js App Router application
packages/
  contracts/            Zod API DTOs, shared constants, generated types
  config/               TypeScript/lint/test configuration (not runtime secrets)
docs/                   Product, technical, workflow, roadmap, runbook
infra/
  caddy/                Reverse proxy configuration
  compose/              Production overlays if they outgrow root compose files
scripts/                Setup, doctor, backup, restore, smoke
```

Inside `apps/api`, use a modular monolith:

```text
src/
  modules/{auth,users,tweets,social,search}/
    domain/              policies/value objects; no HTTP/database imports
    application/         use cases and ports
    infrastructure/      Drizzle repositories and adapters
    http/                routes, request/response mapping
  platform/              config, db, logging, security, errors
  app.ts                 injectable app factory
  server.ts              process/transport startup only
```

Do not split into microservices. The workload and team do not justify distributed transactions or operational overhead.

## Authentication/session model

- Email/password with Argon2id using parameters calibrated for production hardware.
- Opaque random session token in an HTTP-only cookie; store only a SHA-256 token hash in `sessions`.
- Rotate on login and security-sensitive changes; revoke on logout; absolute expiry initially 7 days.
- `Secure` in production, `SameSite=Lax`, narrow path/domain, intentional preview behavior.
- Double-submit or session-bound CSRF token required on mutations in addition to SameSite protection.
- Rate limit registration/login and writes. If horizontally scaled, move limiter/session hot state to Redis only when necessary; PostgreSQL is sufficient initially.

## API conventions

- Version prefix `/v1`; JSON; UTC ISO timestamps; UUIDv7 identifiers.
- OpenAPI generated from route schemas; client types generated/checked in CI.
- Opaque, signed keyset cursors. Never expose raw offset as the timeline contract.
- Error envelope: stable machine code, human-safe message, field details where safe, request ID.
- Mutations return canonical relationship/count state to reconcile optimistic UI.

## Consistency and concurrency

- Unique indexes own set invariants for follows/likes; `INSERT ... ON CONFLICT` makes commands retry-safe.
- Ownership check and tweet deletion happen in the same transaction/query.
- Prefer computed counts in v1 with correct indexes; add denormalized counters only after measurement and with atomic update/reconciliation.
- Cursor ordering uses `(created_at, id)` and the corresponding composite indexes.

## Caching

- Browser client cache (TanStack Query) handles deduplication, optimistic changes, and invalidation.
- Authenticated API responses default to `Cache-Control: private, no-store` until deliberate caching is designed.
- No Redis in v1. Add it only for measured cross-instance rate limiting/cache/pub-sub needs.

## Architectural fitness rules

- Domain/application modules may not import Fastify, React, or database clients.
- Web never connects directly to PostgreSQL.
- API process is stateless apart from in-flight work; uploads/backups never rely on container filesystem.
- All list queries are bounded and use cursor pagination.
- Bonus features are behind server and client feature flags.

## Open decisions before implementation

1. Final product/domain name and resulting cookie/CORS origins.
2. Whether production DB starts on the Droplet or on a free managed provider (recommendation in infrastructure doc).
3. Public visibility for logged-out tweets. Profiles are public in v1: `GET /v1/users/:username` allows an anonymous read and omits email, credentials, and storage keys (requirements rule 10).
4. Account deletion/export behavior and retention.
