# Product and delivery roadmap

The sequence optimizes for early end-to-end validation. A milestone is complete only when code, tests, documentation, migrations, observability, and a deployable artifact are present.

## Dependency graph

`M0 Decisions → M1 Foundation → M2 Auth → M3 Tweets → M4 Social → M5 Search/UI → M6 Conversations → M7 Notifications/live updates → M8 Local seed/activity tools`

After M3, profile UI work can proceed alongside M4. The project is local-only; production deployment is out of scope.

## M0 — Product and architecture baseline (current)

- Approve requirements, non-goals, stories, flows, data model, stack, infrastructure, testing gates, and runbook.
- Record open decisions as ADRs when implementation reveals a material trade-off.
- **Exit:** stakeholders accept required scope and backlog has traceability to acceptance criteria.

## M1 — Reproducible foundation

- pnpm workspace: `apps/web`, `apps/api`, `packages/contracts`, `packages/config`.
- Multi-stage Dockerfiles, development Compose, production Compose overlay, health checks.
- Typed environment loader and `doctor`/`setup` scripts with automated shell tests.
- CI: lint, formatting, types, unit/integration tests, build, container scan, secret scan.
- Baseline Next.js and Fastify health path; Postgres migrations run as a one-shot job.
- **Exit:** clean clone to healthy stack via documented commands; CI green; non-root production containers.

## M2 — Authentication and profiles

- Registration, login/logout, session rotation/revocation, CSRF, route guards, rate limits.
- Public profile and own-profile edit.
- Unit, integration, browser, accessibility, and security tests for US-A01–A03.
- **Exit:** all authentication acceptance criteria automated and passing in production-like containers.

## M3 — Tweets and timeline

- Tweet create/delete, home timeline query, opaque cursor, composer/feed UI.
- Query-plan fixture to catch N+1/unindexed regressions.
- Browser tests for empty/error/end states and responsive widths.
- **Exit:** US-B01–B03 pass for AC-B01.1–AC-B01.4 and US-B02–B03; timeline p95 target passes baseline load test.
- **Follow-up:** TWT-03 covers AC-B01.5–AC-B01.7 (TWEET-03). It is not part of the original M3 exit.

## M4 — Social graph

- Follow/unfollow, like/unlike, counters, followers/following lists.
- Concurrency and idempotency tests, cache reconciliation, authorization tests.
- **Exit:** US-C01–C03 pass without count drift under concurrency test.

## M5 — Search and release-quality UI

- User search with deterministic ranking and indexes.
- Finish three breakpoint layouts; keyboard/screen-reader review; full error-state polish.
- Cross-browser Playwright suite and exploratory test charter.
- **Exit:** US-D01 and US-E01 pass; no serious/critical axe findings; required scope demo approved.

## M6 — Conversations

- Nested, publicly readable tweet replies with bounded thread pagination and accessible UI.
- Root deletion removes the complete reply subtree for this challenge; document fan-out/locking risk and avoid treating this as a production pattern.
- **Exit:** thread API/UI, subtree deletion, accessibility, and real PostgreSQL tests pass.

## M7+ — Planned features, one at a time

1. **SSE live timeline** — measure connection budget and reconnection behavior.
2. **Image attachments** — introduce S3-compatible storage and content safety constraints.
3. **Notifications** — implement transactional outbox and deduplication.

Each is independently feature-flagged, observable, tested, and safely removable.

## Plan mutation protocol

If scope or architecture changes, update the affected requirement/story first, record the decision and consequences, re-evaluate dependencies and tests, then modify the backlog. Never let implementation silently redefine acceptance criteria.
