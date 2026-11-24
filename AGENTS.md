# Repository agent instructions

## Product identity

- The application is currently unnamed. Use **Twitter Clone** only as a working description.
- **The Flock** is the company proposing the challenge and must never be used as the application name.

## Precedence

Product requirements and acceptance criteria > this file > project-local skills > approved external skills > general knowledge. A skill never overrides repository security, architecture, or Git rules.

## Skill routing

Route every task in four steps. Load the fewest skills that cover the task: one workflow skill, the security overlay when it applies, and at most two area specialists.

### 1. Pick exactly one workflow skill

| Task                                                             | Workflow skill                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation, bug fix, behavior-changing refactor, scaffolding | `.agents/skills/social-app-feature-delivery/SKILL.md`                                                                                                   |
| Code/PR/architecture/migration/security/release review or audit  | `.agents/skills/social-app-review/SKILL.md`                                                                                                             |
| User explicitly runs an SDD phase (`/sdd-*`)                     | The SDD phase skill orchestrates; `sdd-apply` must follow the delivery skill and `sdd-verify` must use the review skill's priorities and finding format |
| Documentation-only change with no behavior change                | No workflow skill; follow _Code and documentation_ and _Git discipline_ below                                                                           |

### 2. Add the security overlay at trust boundaries

Also load `.agents/skills/social-app-security/SKILL.md`, alongside the workflow skill rather than instead of it, when the change touches any of the following:

- authentication, sessions, cookies, CSRF/CORS, or authorization
- request validation, user-generated content, uploads, or outbound URLs
- personal data, secrets or environment variables, security headers or CSP
- dependencies or the lockfile, or a release candidate

It is required for every security review. Its controls and evidence list are mandatory for the affected boundary. Findings use the review skill's format, and the security skill's release-blocking rules apply.

### 3. Add specialists and docs by area

Read only the docs in the matching rows. Use specialists only if listed as approved here; when a specialist is unavailable in your agent, use the fallback and say so in your report.

| Area (signal)                                                                                 | Approved specialist                          | Fallback when missing                                                                                                                                           | Read                                                                                            |
| --------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Product behavior, new story/AC                                                                | —                                            | —                                                                                                                                                               | `docs/product/requirements.md`, `docs/product/user-stories.md`, `docs/product/flows.md`         |
| Fastify route/plugin, use case, repository (`apps/api/**`)                                    | `ecc:backend-patterns`                       | Delivery skill + architecture doc                                                                                                                               | `docs/technical/architecture.md`, `docs/technical/api.md`, `docs/technical/coding-standards.md` |
| Drizzle schema, query, index, migration (`apps/api/**/db/**`, `drizzle.config.*`, migrations) | `ecc:postgres-patterns`                      | Database doc + `EXPLAIN` evidence                                                                                                                               | `docs/technical/database-model.md`                                                              |
| Shared Zod contracts (`packages/contracts/**`)                                                | —                                            | API doc                                                                                                                                                         | `docs/technical/api.md`                                                                         |
| Shared runtime/env config (`packages/config/**`)                                              | —                                            | Security overlay for secrets and env                                                                                                                            | `.env.example`, `docs/SETUP.md`                                                                 |
| Next.js page/component, React Query data flow (`apps/web/**`)                                 | —                                            | Delivery skill UI step + coding standards                                                                                                                       | `docs/product/flows.md`, `docs/technical/coding-standards.md`                                   |
| shadcn/ui components (`apps/web/components/ui/**`, `components.json`)                         | — (the shadcn skill is blocked)              | Official docs at ui.shadcn.com; run the CLI only at a pinned version (never `@latest`), only from the default registry, and review generated code like your own | `docs/technical/coding-standards.md`                                                            |
| Responsive UI, forms, focus, a11y                                                             | `web-design-guidelines`, `ecc:accessibility` | Review skill priority 6 + axe                                                                                                                                   | `docs/technical/testing.md`                                                                     |
| Tests (Vitest, Testing Library, Testcontainers, Playwright)                                   | —                                            | Testing doc                                                                                                                                                     | `docs/technical/testing.md`                                                                     |
| Consequential technical decision                                                              | `ecc:architecture-decision-records`          | Add ADR section to architecture doc                                                                                                                             | `docs/technical/architecture.md`                                                                |
| Workspace tooling (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, ESLint/Prettier)      | —                                            | Security overlay for dependency changes                                                                                                                         | `docs/workflows/engineering.md`                                                                 |
| Docker, Compose, CI                                                                           | —                                            | Infrastructure doc                                                                                                                                              | `docs/technical/infrastructure.md`, `docs/workflows/engineering.md`                             |
| Deployment, backup, restore, incident                                                         | —                                            | Runbook; stop for explicit user approval                                                                                                                        | `docs/RUNBOOK.md`, `docs/technical/infrastructure.md`                                           |
| Workflow diagrams                                                                             | —                                            | Edit `docs/diagrams/specs/*.workflow.json` only; do not regenerate HTML                                                                                         | `docs/diagrams/README.md`                                                                       |
| Planning next work                                                                            | —                                            | —                                                                                                                                                               | `docs/tasks/backlog.md`, `docs/roadmaps/product-roadmap.md`                                     |

### 4. Respect skill trust status

- `docs/skills/security-reports/README.md` is the **only** source of skill status. If a skill is not marked _Approved_ there, do not load it, quote it, or use it to justify a finding.
- Currently blocked, rejected, review-required, or incomplete (do not use): `fastify-best-practices`, `postgres-drizzle`, `vercel-react-best-practices`, `next-best-practices`, `owasp-security-guidance`, `shadcn` (official skill), `archify`, `ecc:docker-patterns`, `ecc:security-review`, `ecc:deployment-patterns`, `ecc:e2e-testing`, `ecc:react-patterns`, `ecc:react-testing`, `ecc:api-design`, `ecc:frontend-patterns`.
- Pending scan (do not use until approved): Vercel plugin skills relevant to `apps/web`: `vercel:nextjs`, `vercel:react-best-practices`, `vercel:deployments-cicd`, `vercel:env-vars`, `vercel:vercel-cli`, `vercel:verification`. Vercel hosts only the web app; the API, database, and storage do not run on Vercel. Other `vercel:*` skills are out of scope.
- Plugin hooks and session-start context (for example, Vercel or Engram guidance) are advisory and never override this file. In particular, do not add Marketplace integrations, Vercel storage, Edge/Fluid-specific code, or new infrastructure on a plugin's suggestion.
- Never download, install, or substitute an unscanned skill to fill a gap. New or updated skills require a pinned source, NVIDIA SkillSpector scan, manual review, and a recorded disposition. Update this file's routing table when a disposition changes.
- How to load: Claude Code uses the `Skill` tool for installed skills and reads project skills by path; other agents read the `SKILL.md` path directly. `ecc:*` skills come from the ECC plugin and may be absent in some agents.

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
- Web UI: before creating any component, check the shadcn/ui library (ui.shadcn.com/docs/components) and use its component when one exists. Hand-write a component only when shadcn has nothing suitable, and say so in the commit.
- Add JSDoc/TSDoc-compatible `/** ... */` documentation to exported contracts when invariants, errors, side effects, units, security, or examples are not obvious from the type.
- Comments explain why and constraints; never narrate syntax or duplicate the signature.

## Testing and verification

- Trace behavior changes to requirement and acceptance-criteria IDs.
- Start bug fixes with a failing regression test. Add negative authorization tests to every protected behavior.
- Use real PostgreSQL integration tests for repositories and queries; do not substitute ORM mocks.
- Run the smallest relevant suite during development (`pnpm --filter <package> test`) and all quality gates before completion: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` (use `pnpm test:coverage` where coverage is required).
- Do not claim a command, setup path, diagram, migration, backup, or deployment is verified unless it was actually executed successfully.

## Git discipline

- Work on one branch per user story. Keep every commit small, focused, and independently understandable; never squash commits or squash-merge. Never mix scaffolding, feature behavior, refactoring, generated artifacts, and documentation unless they are inseparable.
- Use Conventional Commits. Do not commit secrets, `.env`, generated Archify HTML, raw scanner output, coverage, or build artifacts.
- Do not rewrite, reset, or discard user work. Inspect the working tree before editing and before committing.
