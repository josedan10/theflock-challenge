# Engineering workflow

## Branch and pull request

1. Branch from green `main`: `feat/FND-02-api-foundation`, `fix/AUTH-03-session-rotation`.
2. Use one branch and PR per user story (for example `feat/AUTH-02-registration` for US-A01); include requirement/AC IDs.
3. Commit messages use Conventional Commits.
4. PR description includes behavior, risks, screenshots for UI, migration/rollback notes, and verification commands.
5. Build the story as many small commits, one concern each (contract, migration, adapter, use case, route, docs). A single commit containing the whole story is not accepted.
6. Required checks and one approval precede merge. Merge with a merge commit; **never squash**, so every commit stays visible in history. Delete the branch after merging.

## Test-driven delivery loop

1. Select an acceptance criterion.
2. Add the cheapest test that proves behavior (domain unit → API integration → browser journey).
3. Observe the new test fail for the intended reason.
4. Implement the minimum behavior; refactor with tests green.
5. Run affected suite locally, then the full CI suite.
6. Update docs and traceability.

## CI stages

1. **Fast:** formatting, lint, typecheck, dependency policy, secret scan.
2. **Test:** unit/component with coverage; integration against fresh Postgres; migration test.
3. **Browser:** Playwright on Chromium every PR; Firefox/WebKit on main/nightly.
4. **Security:** SAST, dependency audit, Dockerfile lint, image vulnerability scan, SBOM.
5. **Build:** web production build and immutable API image tagged with commit SHA.
6. **Preview:** Vercel preview + isolated API/database when feasible; smoke test.

Failed/flaky tests block merge. Quarantine requires an owner, issue, reason, and expiry date.

## Database migration workflow

- Schema changes are forward-compatible: expand → migrate/backfill → switch reads/writes → contract later.
- Never edit an applied migration. Generate a new migration.
- CI applies every migration from zero and against a previous-version fixture.
- Production migration is a separate one-shot task before application rollout; application containers never race to migrate on boot.
- Take/verify a backup before destructive changes. Prefer forward fixes to risky down migrations.

## Release workflow

1. Promote the exact tested image digest from staging.
2. Verify backup, migration plan, secrets, capacity, and rollback image.
3. Run migration job; deploy API with health-gated rolling replacement.
4. Deploy/promote web on Vercel.
5. Run smoke tests and watch error/latency/auth metrics for 15 minutes.
6. Record release SHA/image digest and close or roll back.

## API and security review checklist

- Input and output validated; authn/authz explicit; resource ownership tested.
- Query is bounded, paginated, indexed, and avoids N+1.
- Mutation is idempotent or safely retryable; transaction boundary is correct.
- Cookie/CORS/CSRF and cache headers are intentional.
- Logs exclude passwords, cookies, tokens, email search values, and raw database URLs.
- Error response is stable and does not leak internals.

## Documentation workflow

- Requirements describe _what_; ADRs and technical docs describe _why/how_; API schemas are executable truth.
- Any behavior-changing PR updates the relevant document.
- Setup/runbook commands are executed in CI or a scheduled clean-environment job to prevent documentation drift.
