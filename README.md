# Twitter Clone (working title)

This yet-to-be-named product is a mobile-first social application for short posts, follows, likes, user search, and chronological timelines. **“The Flock” is the company proposing the challenge, not the application name.** This repository currently contains the product and engineering blueprint that will guide implementation.

## Status

**Planning / foundation.** Product scope, acceptance criteria, architecture, data model, delivery roadmap, runbook, and a testable setup contract are documented. Application packages will be introduced in Milestone 1.

## Chosen stack

- **Web:** Next.js + React + TypeScript, deployed to Vercel
- **Styling:** Tailwind CSS v4 utilities over light/dark design tokens in `apps/web/app/styles.css`
- **API:** Fastify + TypeScript, packaged as an OCI/Docker image
- **Database:** PostgreSQL + Drizzle ORM/migrations
- **Validation:** Zod schemas shared through a workspace package
- **Tests:** Vitest, Testing Library, Supertest/light-my-request, Testcontainers, Playwright, axe
- **Local/production containers:** Docker multi-stage builds and Docker Compose
- **Production API:** the existing DigitalOcean Droplet behind Caddy, initially

See [the architecture decision](docs/technical/architecture.md) and [deployment comparison](docs/technical/infrastructure.md).

## Documentation map

| Document                                                             | Purpose                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Product requirements](docs/product/requirements.md)                 | Scope, constraints, non-functional requirements                      |
| [User stories and acceptance criteria](docs/product/user-stories.md) | Testable behavior by feature                                         |
| [User flows](docs/product/flows.md)                                  | End-to-end journeys and failure paths                                |
| [Workflow diagrams](docs/diagrams/README.md)                         | Interactive Archify diagrams for every required and optional feature |
| [Roadmap](docs/roadmaps/product-roadmap.md)                          | Milestones, dependencies, and definition of done                     |
| [Engineering workflow](docs/workflows/engineering.md)                | Branch, review, CI, migration, and release process                   |
| [Team skills](docs/skills/required-skills.md)                        | Competencies and ownership expectations                              |
| [Architecture](docs/technical/architecture.md)                       | System boundaries and technical decisions                            |
| [Database proposal](docs/technical/database-model.md)                | Tables, constraints, indexes, and queries                            |
| [API contract](docs/technical/api.md)                                | Initial HTTP endpoints and conventions                               |
| [Testing strategy](docs/technical/testing.md)                        | Test pyramid, coverage gates, and CI matrix                          |
| [Coding standards](docs/technical/coding-standards.md)               | Architecture/design patterns, legibility, errors, and JSDoc rules    |
| [Infrastructure](docs/technical/infrastructure.md)                   | Hosting decision, containers, environments                           |
| [Setup guide](docs/SETUP.md)                                         | Prerequisites, configuration, and troubleshooting                    |
| [Runbook](docs/RUNBOOK.md)                                           | Deploy, rollback, backup, restore, and incidents                     |
| [Backlog](docs/tasks/backlog.md)                                     | PR-sized implementation tasks                                        |

## Setup contract (available now)

1. Install Docker Desktop/Engine with Compose v2, Git, Node.js 22, and Corepack.
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Diagnose the workstation and configuration:
   ```bash
   ./scripts/doctor.sh
   ```

The doctor prints every missing command or variable and a concrete remediation. Until application packages land, it will also state that the repository is in planning phase rather than failing mysteriously.

## Guiding principles

1. Ship the required scope before bonus features.
2. Keep the timeline chronological; do not introduce ranking.
3. Enforce permissions and invariants in both the API and database.
4. Prefer behavior coverage and production-like integration tests over superficial line coverage.
5. Never commit secrets or use production data in local/test environments.

## License

To be decided before public distribution.
