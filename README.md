# Twitter Clone (working title)

This yet-to-be-named product is a mobile-first social application for short posts, follows, likes, user search, and chronological timelines. **“The Flock” is the company proposing the challenge, not the application name.**

## Status

**Active development.** The containerized Next.js, Fastify, and PostgreSQL foundation is implemented. Authentication and its automated test coverage are currently under development.

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

## Run locally

### Prerequisites

- Docker Desktop or Docker Engine with Compose v2 running
- Node.js **22 LTS** and Corepack
- Git

Node 23 is not supported by the integration-test tooling. Confirm the active version with `node --version` before installing dependencies.

### 1. Install dependencies

```bash
corepack enable
pnpm install --frozen-lockfile
```

### 2. Configure the environment

```bash
cp .env.example .env
openssl rand -base64 48
```

Copy the generated value into `SESSION_SECRET` in `.env`, replacing `replace_me_with_at_least_32_characters`. Never commit `.env`.

Validate Docker, Node, Compose, and every required variable:

```bash
./scripts/doctor.sh
```

Do not continue until the doctor reports `0 error(s)`.

### 3. Start PostgreSQL and migrate

```bash
docker compose up -d postgres
pnpm db:migrate
```

### 4. Start the web and API containers

```bash
docker compose up --build
```

Once the services are healthy, open:

- Web application: <http://localhost:3000>
- API readiness: <http://localhost:4000/health/ready>
- API liveness: <http://localhost:4000/health/live>

Verify the running services from another terminal:

```bash
curl --fail http://localhost:4000/health/ready
docker compose ps
```

If a default port is occupied, change `WEB_PORT`, `API_PORT`, or `POSTGRES_PORT` in `.env`. When changing the web or API port, also update the corresponding URLs and `CORS_ORIGIN`.

### Stop the project

```bash
docker compose down
```

This preserves the PostgreSQL volume. To deliberately delete all local database data, run `docker compose down -v` instead.

For troubleshooting, browser-test installation, and quality-gate commands, see the complete [setup guide](docs/SETUP.md).

## Guiding principles

1. Ship the required scope before bonus features.
2. Keep the timeline chronological; do not introduce ranking.
3. Enforce permissions and invariants in both the API and database.
4. Prefer behavior coverage and production-like integration tests over superficial line coverage.
5. Never commit secrets or use production data in local/test environments.

## License

To be decided before public distribution.
