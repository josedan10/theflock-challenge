# Testing strategy

“Highest possible coverage” means maximum confidence, not gaming a line percentage. We combine high code coverage with acceptance, boundary, authorization, concurrency, accessibility, migration, and operational tests.

## Coverage policy

| Scope                                               |                                       Minimum gate |
| --------------------------------------------------- | -------------------------------------------------: |
| All product code                                    |     90% statements, lines, functions; 85% branches |
| Domain policies, authz, cursor, validation          |                       100% statements and branches |
| Generated files, type-only declarations, migrations | excluded from line percentage; tested by execution |
| Changed lines                                       |    95%, with no uncovered security/permission path |
| Critical mutation score                             |             80% initially, raised as suite matures |

Targets are ratchets: CI may raise them but cannot lower them without an approved, documented exception. Tests themselves are reviewed for meaningful assertions.

## Layers

### Unit/property tests (Vitest)

- Username/password/tweet value rules, permission policies, cursor encode/decode, event decisions.
- Property-based tests for Unicode length boundaries, cursor tampering, normalization, and pagination ordering.
- No network/database; deterministic time and random ID providers injected.

### Component tests (Testing Library + MSW)

- Forms, composer counter, optimistic follow/like rollback, feed states, responsive navigation semantics.
- Assert behavior/accessible roles rather than implementation details.

### API integration tests (Vitest + Fastify injection + real Postgres)

- Start disposable Postgres via Testcontainers or CI service; apply real migrations.
- Test route schema, transactions, uniqueness, authorization, cascade behavior, search escaping, cursor stability, concurrency.
- Do not mock repositories for these tests. Each test isolates data by transaction/schema/cleanup strategy.

### Contract tests

- OpenAPI validates every status/body fixture.
- Web client build checks generated contract compatibility.
- Production smoke tests validate only safe critical paths with a dedicated test account.

### Browser E2E (Playwright)

Required journeys: register/login/logout, create/delete tweet, follow and see timeline, like/unlike, lists, search, pagination, live timeline without focus steal, unauthorized redirects. Run Chromium on PR; Chromium/Firefox/WebKit on main/nightly. Test 375×812, 768×1024, and 1440×900.

### Accessibility/visual

- `axe` on core pages/states; zero serious/critical violations.
- Keyboard and screen-reader checks before completing the local feature scope.
- Screenshot regression for layout-critical states across breakpoints; review intentional changes.

### Performance and resilience

- Representative local performance checks verify query plans, p95 targets, and error rate when applicable.
- Database query-count assertions and representative `EXPLAIN` snapshots prevent N+1/full scans.
- Kill/restart API during safe reads; verify health/readiness and graceful shutdown.

### Security

- Negative authorization matrix for every mutation.
- CSRF, CORS, cookie flags, rate limit, session expiry/revocation/rotation, input injection/XSS output tests.
- CI: secret scan, dependency/SAST, SBOM, and container vulnerability scan. Schedule DAST against staging.

### Setup/operations

- Bats tests run `doctor.sh` with missing tools/vars and assert actionable messages.
- Clean-runner job follows `docs/SETUP.md` exactly.
- Migration test from zero and the prior schema. Local database backup/restore guidance is for developer data recovery only, not an off-host production service.

## Fixtures and determinism

- Factories create the minimum valid entity and accept explicit overrides.
- Freeze time where order matters and use distinct IDs to test tie-breaks.
- Never share mutable production-like accounts across parallel tests.
- Retry is not a flake fix. Capture trace/video/log on first failure and fix root cause.

## Acceptance traceability

Test names include stable IDs, for example `US-B03 AC-B03.3 keeps cursor pages stable during concurrent insert`. A generated CI report should flag required ACs with no test reference.

## Recommended commands (once workspace exists)

```bash
pnpm lint && pnpm typecheck
pnpm test:unit --coverage
pnpm test:integration
pnpm test:e2e
pnpm test:mutation
pnpm test:load:smoke
```
