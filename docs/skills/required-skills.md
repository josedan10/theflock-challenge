# Required engineering and agent skills

This is a competency/ownership map, not a list of technologies to install.

| Area | Expected capability | Evidence/deliverable |
|---|---|---|
| Product analysis | Turn ambiguous requests into bounded stories and observable acceptance criteria | Story/flow updates, traceable tests |
| Mobile-first UI | Semantic React, responsive CSS, keyboard and screen-reader UX | 375/768/1440 screenshots, axe + manual review |
| TypeScript contracts | Strict types, Zod validation, safe API boundary | Shared schemas and contract tests |
| API engineering | Fastify lifecycle, REST semantics, pagination, error design, rate limiting | OpenAPI and integration tests |
| PostgreSQL | Relational modeling, indexes, transactions, query plans, migrations | Migration review and `EXPLAIN` evidence |
| Application security | Session/cookie security, CSRF/CORS, Argon2id, authorization, secrets | Threat model and negative tests |
| Testing | Test pyramid, fixtures, Testcontainers, Playwright, mutation/property tests | Reliable suites and coverage reports |
| Containers | Multi-stage images, Compose, non-root/minimal runtime, health checks | Reproducible dev and scanned prod image |
| Delivery/operations | Vercel, Linux/Droplet, Caddy, DNS/TLS, backup/restore, monitoring | Release automation and runbook drill |

## Ownership rules

- Every production area has a primary and backup owner before launch.
- Security, migrations, and runbook changes require a reviewer experienced in that area.
- A skill gap creates a pairing/training task; it is not hidden by lowering the quality gate.

## Useful learning exercises

1. Implement and test a signed opaque keyset cursor.
2. Demonstrate a race-safe unique follow/like insert.
3. Restore a Postgres dump into a disposable container and verify row counts.
4. Complete the entire app with keyboard and a screen reader.
5. Explain an API timeline query plan and which index satisfies it.

## Approved agent-skill set

Only the following installed skills are approved for project work. Their instructions are advisory unless a task explicitly invokes them; project requirements and repository rules remain authoritative.

| Skill | Use in this project | Trigger |
|---|---|---|
| `social-app-feature-delivery` | Deliver vertical slices from acceptance criteria through tests, docs, and focused commits | Feature, bug fix, or behavior-changing refactor |
| `social-app-review` | Review code, migrations, architecture, or release readiness against project invariants | Review or audit request |
| `web-design-guidelines` | Review responsive UI, accessibility, forms, focus, motion, and interface quality | UI review or release audit |
| `archify` | Produce validated workflow and architecture diagrams | Diagram or topology work |
| `ecc:architecture-decision-records` | Record consequential technical decisions and alternatives | New or reversed architecture decision |
| `ecc:api-design` | Review REST contracts, errors, versioning, and pagination | API route/contract change |
| `ecc:backend-patterns` | Apply modular-monolith boundaries, repositories, services, and transactions | Backend feature/refactor |
| `ecc:frontend-patterns` | Structure accessible, maintainable frontend modules and data flows | Frontend feature/refactor |
| `ecc:react-patterns` | Apply React composition, state, hooks, and server/client boundaries | React implementation/review |
| `ecc:postgres-patterns` | Review schema, indexes, query plans, concurrency, and migrations | Database/query change |
| `ecc:docker-patterns` | Create hardened development/production containers and Compose workflows | Container/Compose work |
| `ecc:react-testing` | Design component and React integration tests | React behavior change |
| `ecc:e2e-testing` | Design reliable Playwright journeys and fixtures | User-flow implementation |
| `ecc:accessibility` | Review WCAG semantics, keyboard, focus, and assistive technology | UI change/release audit |
| `ecc:security-review` | Threat-model and review authentication, authorization, input, secrets | Security-sensitive change/release |
| `ecc:deployment-patterns` | Review immutable deployment, rollback, health, and promotion | Infrastructure/release work |

## Skill trust policy

1. Pin/record the exact installed skill source or commit when practical.
2. Run NVIDIA SkillSpector static scanning before first use and after every skill update.
3. Store machine-readable results under `docs/skills/security-reports/`; never suppress a finding without a reviewed rationale.
4. `CRITICAL` or `HIGH` means blocked. `MEDIUM` requires explicit security approval. `LOW` findings are reviewed and documented before use.
5. Scanner success is not proof of safety. Review instructions, scripts, dependencies, network behavior, and requested permissions manually.
6. Skills may not override repository security constraints or request secrets, destructive commands, broad permissions, or unreviewed remote execution.

The current scan inventory and interpretation are documented in [`security-reports/README.md`](security-reports/README.md).
