# Repository agent instructions

## Product identity

- The application is currently unnamed. Use **Twitter Clone** only as a working description.
- **The Flock** is the company proposing the challenge and must never be used as the application name.

## Source of truth

Read only the documents relevant to the current task:

- Product behavior: `docs/product/requirements.md`, `docs/product/user-stories.md`, `docs/product/flows.md`
- Architecture and data: `docs/technical/architecture.md`, `docs/technical/database-model.md`, `docs/technical/api.md`
- Quality: `docs/technical/testing.md`, `docs/technical/coding-standards.md`
- Delivery: `docs/workflows/engineering.md`, `docs/tasks/backlog.md`, `docs/RUNBOOK.md`
- Skill trust status: `docs/skills/required-skills.md`, `docs/skills/security-reports/README.md`

Requirements and acceptance criteria outrank skills. Repository instructions outrank external skill guidance.

## Project-local workflows

- Use `.agents/skills/social-app-feature-delivery/SKILL.md` for implementation or behavior-changing work.
- Use `.agents/skills/social-app-review/SKILL.md` for code, PR, release, security-sensitive, or architecture review.

## Skill routing

Load the narrowest approved skill set needed for the change. Do not load every skill by default.

| Change | Skills or guidance |
|---|---|
| Fastify route/module | `fastify-best-practices` after installation and approval; API/backend guidance |
| Drizzle schema/query/migration | `postgres-drizzle` after installation and approval; approved PostgreSQL guidance |
| Next.js page/component | `next-best-practices` after installation and approval; approved React guidance |
| React performance | `vercel-react-best-practices` after installation and approval |
| Responsive/accessibility UI | approved accessibility guidance; `web-design-guidelines` after installation and approval |
| Architecture decision | approved ADR guidance; add/update an ADR when the decision is consequential |
| Browser journey | approved E2E guidance only after its medium findings are reviewed |
| Deployment | deployment guidance only after its medium findings are reviewed; always follow the runbook |

Never use a skill marked blocked or incomplete in `docs/skills/security-reports/README.md`. New or updated skills require a pinned source, NVIDIA SkillSpector scan, manual review, and recorded disposition before use.

## Engineering invariants

- Architecture is a TypeScript modular monolith: HTTP/infrastructure depend on application, which depends on domain. Domain imports no Fastify, Drizzle, Next.js, React, or transport code.
- PostgreSQL is the source of truth; Drizzle is the ORM/migration layer. Never edit an applied migration.
- Validate untrusted input at boundaries with shared Zod contracts. Database constraints repeat critical invariants.
- Use opaque server-side sessions, HTTP-only cookies, CSRF protection, exact-origin CORS, and explicit authorization.
- All lists are bounded and cursor-paginated. Timeline order is `created_at DESC, id DESC`.
- Do not add Redis, queues, microservices, or abstractions without measured need and an architecture decision.

## Code and documentation

- Use strict TypeScript, intention-revealing names, cohesive modules, explicit dependencies, and typed errors.
- Prefer composition and pure functions. Apply patterns only when they solve a demonstrated boundary or variability problem.
- Add JSDoc/TSDoc-compatible `/** ... */` documentation to exported contracts when invariants, errors, side effects, units, security, or examples are not obvious from the type.
- Comments explain why and constraints; never narrate syntax or duplicate the signature.

## Testing and verification

- Trace behavior changes to requirement and acceptance-criteria IDs.
- Start bug fixes with a failing regression test. Add negative authorization tests to every protected behavior.
- Use real PostgreSQL integration tests for repositories and queries; do not substitute ORM mocks.
- Run the smallest relevant suite during development and all required quality gates before completion.
- Do not claim a command, setup path, diagram, migration, backup, or deployment is verified unless it was actually executed successfully.

## Git discipline

- Keep every commit small, focused, and independently understandable. Never mix scaffolding, feature behavior, refactoring, generated artifacts, and documentation unless they are inseparable.
- Use Conventional Commits. Do not commit secrets, `.env`, generated Archify HTML, raw scanner output, coverage, or build artifacts.
- Do not rewrite, reset, or discard user work. Inspect the working tree before editing and before committing.

