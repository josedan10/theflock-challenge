---
name: social-app-feature-delivery
description: Deliver a vertical feature or behavior change in this repository from acceptance criterion through contracts, implementation, tests, documentation, and focused commits. Use for application features, bug fixes, or behavior-changing refactors; not for read-only review.
---

# Social App Feature Delivery

Follow `AGENTS.md`. This skill adds the repository-specific delivery loop; it does not replace framework documentation or grant permission for deployment, destructive database actions, or external mutations.

## Establish the slice

1. Identify the requirement, user-story, and acceptance-criteria IDs. If behavior is genuinely unspecified, update the product document before implementing it.
2. Inspect the affected workflow specification in `docs/diagrams/specs/` and the relevant technical contract. Change diagrams only when the workflow changes.
3. Inspect nearby code and tests before choosing structure. Preserve established conventions unless they violate documented architecture.
4. Select only approved task-specific skills using the routing table in `AGENTS.md`.

## Deliver vertically

Choose only the steps the slice requires, while preserving this dependency direction:

1. Add or update shared Zod input/output contracts.
2. Add domain rules and application use cases without framework or database imports.
3. Design database constraints, indexes, queries, and forward-compatible migrations. Use the transaction handle for every statement inside a transaction.
4. Add infrastructure adapters and Fastify HTTP mapping. Authenticate, authorize, validate, rate-limit, and map typed errors explicitly.
5. Add the smallest accessible Next.js/React UI that completes the acceptance criterion. Cover loading, empty, success, error, pending, and rollback states that apply.
6. Add observability without secrets or personal data: request IDs, safe structured context, and actionable errors.

Do not create speculative abstractions or optional-feature infrastructure during a required-feature slice.

## Prove behavior

- Add the cheapest meaningful unit/property test for domain behavior.
- Exercise repositories, migrations, constraints, concurrency, and queries against real PostgreSQL.
- Add component tests for user-visible states and a Playwright journey for critical cross-boundary behavior.
- Include negative authentication/authorization, boundaries, idempotency, and concurrency cases when applicable.
- Reference acceptance-criteria IDs in behavior test names.
- Add JSDoc to exported contracts when the semantic contract is not obvious from TypeScript.

Run affected checks first, then the full gates required by `docs/technical/testing.md`. Record commands and results; never describe an unexecuted check as passing.

## Finish the slice

1. Update OpenAPI/contracts, workflow/technical docs, setup, or runbook only where behavior changed.
2. Review the diff for architectural boundaries, secrets, unrelated edits, generated files, and missing documentation.
3. Split work into small Conventional Commits by coherent concern. A migration and the code that depends on it may stay together when separating them would leave a broken commit.
4. Report completed acceptance criteria, verification evidence, migration/operational impact, and remaining risks.

Stop before production deployment, destructive data operations, or scope expansion unless the user explicitly authorizes them.

