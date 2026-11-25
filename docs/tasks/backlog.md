# Implementation backlog

Tasks are intentionally PR-sized. Each PR references requirement and acceptance-criteria IDs, includes tests, and leaves `main` deployable.

## Foundation

- [x] **FND-01:** Initialize pnpm/Turborepo workspace with strict shared TypeScript, ESLint, Prettier, commit checks.
- [x] **FND-02:** Scaffold Fastify API with configuration schema, request IDs, structured logging, error envelope, liveness/readiness.
- [x] **FND-03:** Scaffold Next.js app with mobile-first shell, error boundary, loading skeletons, typed API client.
- [x] **FND-04:** Add PostgreSQL + Drizzle schema/migration harness and disposable test database.
- [x] **FND-05:** Add dev/prod multi-stage Dockerfiles, Compose profiles, health/dependency ordering, non-root users.
- [x] **FND-06:** Implement idempotent `setup.sh`; expand `doctor.sh`; add Bats tests on the Linux CI runner.
- [x] **FND-07:** Add CI quality/security/build matrix and coverage artifact publishing.

## Authentication/profile

- [x] **AUTH-01:** User/session migrations, repositories, factories, uniqueness/concurrency tests.
- [x] **AUTH-02:** Registration service/route and contract tests (US-A01).
- [x] **AUTH-03:** Login/logout/session middleware, CSRF and rate limits (US-A02).
- [x] **AUTH-04:** Registration/login UI and Playwright flows.
- [x] **PRO-01:** Profile read/update API and authorization tests (US-A03).
- [x] **PRO-02:** Responsive profile UI, placeholder avatar, counts, accessibility tests.

## Tweets/timeline

- [x] **TWT-01:** Tweet migration, validation, create/delete service and authorization tests.
- [x] **TWT-02:** Composer/card components and optimistic/error behavior.
- [x] **FEED-01:** Keyset timeline SQL, indexes, cursor signing/validation, integration and explain-plan tests.
- [x] **FEED-02:** Infinite feed with deduplication, retry/end/empty states and Playwright tests.
- [ ] **TWT-03:** Home-timeline posting shows the new tweet with the entrance animation only (no “Posting your tweet…” block, and no artificial wait to keep that block on screen). For 5 seconds after create, that tweet shows a countdown line and Undo, which deletes it without the usual confirmation. Then Undo disappears and AC-B02.3 applies (TWEET-03, US-B01, AC-B01.5–AC-B01.7). Replies stay as they are.

## Social/search

- [x] **SOC-01:** Follow repository/API with unique/self-follow guards and concurrency tests.
- [x] **SOC-02:** Like repository/API with canonical count response and concurrency tests.
- [x] **SOC-03:** Cursor-paginated follower/following API and UI.
- [x] **SRC-01:** Escaped, indexed user search with ranking and integration tests.
- [x] **SRC-02:** Search UI with debounce, minimum length, empty/error states.

## Product features

- [ ] **THR-01:** Nested public replies with parent-tweet validation, bounded thread reads, author context, accessible thread UI, API/UI tests, and documented challenge-only subtree deletion behavior.
- [ ] **NOT-01:** In-app notifications for relevant social activity, with deduplication, read state, pagination, and accessible UI.
- [ ] **LIVE-01:** Live timeline updates with reconnect/catch-up behavior and duplicate suppression.
- [ ] **IMG-01:** Tweet image uploads with validation, ownership, safe storage lifecycle, and accessible rendering.

## Local development experience

- [ ] **SEED-01:** Provide a repeatable full local seed environment with at least 10 users by default; allow a user-specified user count through build configuration or a `setup.sh`/seed-script flag. Keep generated credentials local-only and document how to inspect/reset seeded data.
- [ ] **DEV-01:** Add an opt-in local activity simulator that periodically creates tweets and replies between seeded/fake accounts and real local users. It must be disabled by default and controllable at startup or through an environment feature flag; bound activity rate and make it safe to stop/reset.

## Local quality gates

- [ ] **QA-01:** Maintain responsive/a11y checks at 375/768/1440 widths, representative performance checks, and security tests for all local product features.

## Per-task definition of done

1. Acceptance/requirement IDs traced in PR and tests.
2. Positive, boundary, error, authorization, and concurrency cases where relevant.
3. Coverage gates do not regress; mutation score meets the critical-module threshold.
4. Migration tested both on empty and representative databases; rollback/forward-fix documented.
5. Logs/metrics have no secrets or sensitive data.
6. Docs/setup/API contract updated where behavior changes; local CI and container build pass.
