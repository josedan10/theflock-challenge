# Twitter Clone (working title)

This yet-to-be-named product is a mobile-first social application for short posts, follows, likes, user search, and chronological timelines.

## Status

**Active development.** The containerized Next.js, Fastify, and PostgreSQL foundation is implemented. Authentication and its automated test coverage are currently under development.

Local setup includes 10 demo accounts and sample conversations. Use `pnpm stack:up --seed-users 25` for a larger dataset; see [local demo data](docs/SETUP.md#local-demo-data-seed-01) for sign-in and reset instructions.

### See it live

With `ACTIVITY_SIMULATOR=true` in `.env`, the demo accounts keep posting, replying and liking while you use the app ([how to run, stop and reset it](docs/SETUP.md#local-activity-simulator-dev-01)). They favour real accounts: they reply to your posts, like them and mention you, so your Notifications fill up as well.

Home only shows live posts from people you follow. Register your own account, then follow some or all of these accounts, at `http://localhost:3000/u/<username>` or through Search:

| Username  | Name         | Posts about                         |
| --------- | ------------ | ----------------------------------- |
| `demo_1`  | Maya Chen    | Film photos from the walk to work   |
| `demo_2`  | Andre Brooks | Weeknight cooking                   |
| `demo_3`  | Priya Nair   | Early ridge trails                  |
| `demo_4`  | Jonah Okeke  | Bands in small rooms                |
| `demo_5`  | Elena Varga  | A Tuesday book club                 |
| `demo_6`  | Samir Rahman | Balcony gardening                   |
| `demo_7`  | Nora Silva   | Thursday board games                |
| `demo_8`  | Luis Ibarra  | Cycling the river path              |
| `demo_9`  | Hana Park    | Coffee beans and kettles            |
| `demo_10` | Owen Doyle   | Sketching people waiting for things |

A larger seed adds `demo_11` onward, which reuse these voices in other parts of town.

## Chosen stack

- **Web:** Next.js + React + TypeScript, run locally
- **Styling:** shadcn/ui components (Base UI, pinned CLI) on Tailwind CSS v4, with design tokens in `apps/web/app/styles.css`
- **API:** Fastify + TypeScript, packaged as an OCI/Docker image
- **Database:** PostgreSQL + Drizzle ORM/migrations
- **Validation:** Zod schemas shared through a workspace package
- **Tests:** Vitest, Testing Library, Supertest/light-my-request, Testcontainers, Playwright, axe
- **Local containers:** Docker and Docker Compose for the web, API, and PostgreSQL

See [the architecture](docs/technical/architecture.md) and [local setup](docs/SETUP.md).

## Documentation map

| Document                                                             | Purpose                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Product requirements](docs/product/requirements.md)                 | Scope, constraints, non-functional requirements                      |
| [User stories and acceptance criteria](docs/product/user-stories.md) | Testable behavior by feature                                         |
| [User flows](docs/product/flows.md)                                  | End-to-end journeys and failure paths                                |
| [Workflow diagrams](docs/diagrams/README.md)                         | Interactive Archify diagrams for every required and optional feature |
| [Roadmap](docs/roadmaps/product-roadmap.md)                          | Milestones, dependencies, and definition of done                     |
| [Engineering workflow](docs/workflows/engineering.md)                | Branch, review, CI, and migration process                            |
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
- Node.js **26 LTS** and Corepack
- Git

Confirm the active version with `node --version` before installing dependencies. Node 26 LTS is the recommended development runtime. Node 22–24 still satisfy `engines`; Node 23.0–23.7 need the workspace `undici` patch to load Testcontainers and jsdom.

### 1. Install dependencies

```bash
npm install -g corepack@0.36.0
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
pnpm stack:doctor
```

Do not continue until the doctor reports `0 error(s)`.

### 3. Start PostgreSQL, migrate and seed

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

### 4. Start the web and API containers

```bash
pnpm compose:up
```

Once Corepack is enabled, `pnpm stack:up` does all of the above in one go: it creates `.env` with a generated secret if missing, runs the doctor, installs dependencies, migrates, seeds, and starts the stack. It is safe to re-run.

Once the services are healthy, open:

- Web application: <http://localhost:3000>
- API readiness: <http://localhost:4000/health/ready>
- API liveness: <http://localhost:4000/health/live>

Verify the running services:

```bash
pnpm api:health
pnpm compose:ps
pnpm compose:logs
```

If a default port is occupied, change `WEB_PORT`, `API_PORT`, or `POSTGRES_PORT` in `.env`. When changing the web or API port, also update the corresponding URLs and `CORS_ORIGIN`.

### Feature flags

Optional features are off by default. Turn one on in `.env`, then apply it with the command in the last column.

| Feature                  | Flags in `.env`                                                   | Values                            | Apply with                                            |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| Tweet images             | `UPLOADS_ENABLED=true` **and** `NEXT_PUBLIC_UPLOADS_ENABLED=true` | `true` / `false` (default)        | `pnpm compose:up`                                     |
| Local activity simulator | `ACTIVITY_SIMULATOR=true`                                         | `true` / `false` (default)        | `pnpm stack:up`, or `pnpm activity` in the foreground |
| Simulator pace           | `ACTIVITY_INTERVAL_SECONDS`                                       | `15`–`3600` seconds; default `30` | Restart the simulator                                 |
| Number of demo accounts  | `SEED_USER_COUNT`                                                 | `10`–`100`; default `10`          | `pnpm db:seed`, or `pnpm stack:up --seed-users 25`    |

- **Tweet images:** set both flags. The first lets the API accept uploads and the second shows the picture button in the composer; with only one, posting a picture does not work. Images are stored in the Compose `media-data` volume.
- **Activity simulator:** demo accounts post, reply and like on their own, and lean toward real accounts. Follow the accounts in [See it live](#see-it-live) to watch it on Home. Stop it with `pnpm activity:stop` and undo what it did with `pnpm activity:reset`. Turn on tweet images too if you want its posts to carry pictures. Details in [the setup guide](docs/SETUP.md#local-activity-simulator-dev-01).
- **Always on:** the live Home timeline and notifications need no flag. `REALTIME_ENABLED`, `NOTIFICATIONS_ENABLED` and the `S3_*` keys in `.env.example` are placeholders that nothing reads yet.

### Stop the project

```bash
pnpm compose:down
```

This preserves the PostgreSQL volume. To deliberately delete all local database data, run `pnpm compose:destroy-data` instead.

For troubleshooting, browser-test installation, and quality-gate commands, see the complete [setup guide](docs/SETUP.md).

## Guiding principles

1. Build and verify features in the documented local environment.
2. Keep the timeline chronological; do not introduce ranking.
3. Enforce permissions and invariants in both the API and database.
4. Prefer behavior coverage and real PostgreSQL integration tests over superficial line coverage.
5. Never commit secrets or use production data in local/test environments.

## License

To be decided before public distribution.
