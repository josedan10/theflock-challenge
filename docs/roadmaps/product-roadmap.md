# Product and delivery roadmap

The sequence optimizes for end-to-end validation in a local development environment. A milestone is complete only when code, tests, documentation, migrations, and a reproducible local setup are present.

## Dependency graph

`M0 Decisions → M1 Foundation → M2 Auth → M3 Tweets → M4 Social → M5 Search/UI → M6 Conversations & media → M7 Notifications & live updates → M8 Local seed & activity tools`

After M3, profile UI work can proceed alongside M4. The project is local-only; production deployment and release-hardening work are out of scope.

## M0 — Product and architecture baseline (current)

- Approve requirements, non-goals, stories, flows, data model, stack, infrastructure, testing gates, and runbook.
- Record open decisions as ADRs when implementation reveals a material trade-off.
- **Exit:** stakeholders accept required scope and backlog has traceability to acceptance criteria.

## M1 — Reproducible foundation

- pnpm workspace: `apps/web`, `apps/api`, `packages/contracts`, `packages/config`.
- Dockerfiles and local Compose stack with health checks.
- Typed environment loader and `doctor`/`setup` scripts with automated shell tests.
- CI: lint, formatting, types, unit/integration tests, build, and relevant security checks.
- Baseline Next.js and Fastify health path; Postgres migrations run as a one-shot job.
- **Exit:** clean clone to healthy local stack via documented commands; CI green.

## M2 — Authentication and profiles

- Registration, login/logout, session rotation/revocation, CSRF, route guards, rate limits.
- Public profile and own-profile edit.
- Unit, integration, browser, accessibility, and security tests for US-A01–A03.
- **Exit:** all authentication acceptance criteria automated and passing in production-like containers.

## M3 — Tweets and timeline

- Tweet create/delete, home timeline query, opaque cursor, composer/feed UI.
- Query-plan fixture to catch N+1/unindexed regressions.
- Browser tests for empty/error/end states and responsive widths.
- **Exit:** US-B01–B03 pass; timeline p95 target passes baseline load test.

## M4 — Social graph

- Follow/unfollow, like/unlike, counters, followers/following lists.
- Concurrency and idempotency tests, cache reconciliation, authorization tests.
- **Exit:** US-C01–C03 pass without count drift under concurrency test.

## M5 — Search and release-quality UI

- User search with deterministic ranking and indexes.
- Finish three breakpoint layouts; keyboard/screen-reader review; full error-state polish.
- Cross-browser Playwright suite and exploratory test charter.
- **Exit:** US-D01 and US-E01 pass; no serious/critical axe findings; required scope demo approved.

## M6 — Conversations and media

- Nested, publicly readable tweet replies with bounded thread pagination, clear parent/child relationships, and accessible UI.
- Root deletion removes the complete reply subtree for this challenge; document fan-out/locking risk and avoid treating this as a production pattern.
- Tweet image uploads with validation, ownership, safe local storage, and accessible presentation.
- **Exit:** thread API/UI, subtree deletion, and upload flows pass API, real PostgreSQL integration, browser, and accessibility tests.

## M7 — Notifications and live updates

- In-app notifications with deduplication, read state, and pagination.
- Live timeline updates with reconnect/catch-up behavior and duplicate suppression.
- **Exit:** notification and live-update behavior is tested across reconnects and duplicate delivery.

## M8 — Reproducible local seed and activity simulator

- Seed at least 10 users by default; allow configurable additional users through build/setup options or a script flag.
- Add an opt-in development activity job that generates tweets and replies between seeded accounts and local real users. The feature is disabled by default and can be enabled at startup or through an environment flag, with bounded rate and safe shutdown.
- **Exit:** documented fresh/reset seed workflow and deterministic tests for user-count configuration, disabled-by-default behavior, and simulator lifecycle.

## Plan mutation protocol

If scope or architecture changes, update the affected requirement/story first, record the decision and consequences, re-evaluate dependencies and tests, then modify the backlog. Never let implementation silently redefine acceptance criteria.
