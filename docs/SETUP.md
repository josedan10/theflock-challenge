# Setup guide

This guide sets up the implemented application workspace and explains failures with actionable diagnostics.

## Supported development environment

- macOS or Linux (Windows through WSL2)
- Git
- Docker Desktop or Docker Engine with Compose v2
- Node.js 22 LTS and Corepack
- At least 4 GB free RAM and 5 GB free disk for images/dependencies

## 1. Clone and inspect

```bash
git clone <repository-url>
cd theflock-challenge
cp .env.example .env
```

Generate a unique local session secret and replace `SESSION_SECRET` in `.env`:

```bash
openssl rand -base64 48
```

Do not commit `.env`. The checked-in `.env.example` contains names and safe development placeholders only.

## 2. Run diagnostics

```bash
chmod +x scripts/doctor.sh   # only needed if executable bits were lost
./scripts/doctor.sh
```

The doctor checks Git, Docker/daemon/Compose, Node 22+, Corepack, required variables, and insecure placeholder secrets. It exits non-zero on actionable errors.

Common fixes:

| Message                                     | Fix                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `docker is missing`                         | Install Docker Desktop/Engine and the Compose v2 plugin                                     |
| `daemon is unavailable`                     | Start Docker Desktop or `docker` service; verify `docker info`                              |
| `Node.js 22+ is required`                   | Install Node 22 LTS using your version manager, then reopen shell                           |
| `corepack is missing`                       | Use a Node distribution that includes Corepack or install/enable it according to Node docs  |
| `.env is missing`                           | `cp .env.example .env`                                                                      |
| `SESSION_SECRET must be replaced`           | Generate with `openssl rand -base64 48` and paste the output                                |
| `package.json or pnpm-lock.yaml is missing` | Restore the tracked workspace manifests before continuing                                   |
| `compose.yaml is missing`                   | Restore the tracked Compose manifest before continuing                                      |
| `port ... already in use`                   | Set an unused `WEB_PORT`, `API_PORT`, or `POSTGRES_PORT` in `.env` and update matching URLs |

## 3. Install and verify tooling

```bash
bash -n scripts/doctor.sh
./scripts/test-doctor.sh
pnpm test:scripts
./scripts/doctor.sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

The doctor test uses stubbed prerequisites to verify both success and missing-secret diagnostics. The real doctor command must finish with zero errors before continuing.

## 4. Start the application

These commands are the tested local setup contract:

**Quick start:** `pnpm stack:up` (or `./scripts/setup.sh`) runs the steps below in order. It creates `.env` with a generated `SESSION_SECRET` if the file is missing, runs the doctor, installs dependencies, starts PostgreSQL, applies migrations, then starts and health-checks the API and web app. It is safe to re-run.

Shortcuts: `pnpm compose:up`, `pnpm compose:down`, `pnpm compose:ps`, `pnpm compose:logs`, and `pnpm db:up` (PostgreSQL only).

Manual steps:

```bash
docker compose --profile dev up -d postgres
pnpm db:migrate
docker compose --profile dev up --build
curl --fail http://localhost:4000/health/ready
```

Default local services are web `http://localhost:3000`, API `http://localhost:4000`, and PostgreSQL on `localhost:5433`. The host ports are configurable in `.env`; URLs and `CORS_ORIGIN` must match any changed web/API ports.

Run the quality gates after startup:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm test:e2e
pnpm build
```

`pnpm test:e2e` starts its own API (port 4100) and web app (port 3100) against the database in `DATABASE_URL`: the Compose database locally, a service container in CI. It applies pending migrations first, and each run adds throwaway `e2e-…@example.com` accounts. Keep `docker compose up -d postgres` running before you start it.

Run the test suites with Node 22. Testcontainers fails to load on Node 23.1 (`createZstdDecompress` is missing).

To stop without deleting data: `docker compose down`. To deliberately erase local DB data: `docker compose down -v` (destructive; never run for production).

## Configuration rules

- Values inside containers use service DNS (`postgres`), not `localhost`.
- Browser-visible API URL uses the host URL (`http://localhost:4000`).
- `COOKIE_SECURE=false` is local-only; production must be `true` over HTTPS.
- Production and preview secrets belong in Vercel/Droplet secret configuration, never repository `.env` files.

## Getting diagnostic help

Capture these safe outputs (redact URLs/tokens/passwords):

```bash
./scripts/doctor.sh
docker compose config --services   # once Compose exists
docker compose ps
docker compose logs --tail=100 api postgres
```

Never paste the contents of `.env`, cookies, authorization headers, or a full database URL into an issue.
