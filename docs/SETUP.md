# Setup guide

This guide distinguishes the **current planning repository** from the **future application workspace** so commands never fail without explanation.

## Supported development environment

- macOS or Linux (Windows through WSL2)
- Git
- Docker Desktop or Docker Engine with Compose v2
- Node.js 22 LTS and Corepack (application milestone)
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

The doctor checks Git, Docker/daemon/Compose, Node 22+, Corepack, required variables, and insecure placeholder secrets. It exits non-zero on actionable errors and prints a warning—not a false failure—while application manifests are not yet implemented.

Common fixes:

| Message | Fix |
|---|---|
| `docker is missing` | Install Docker Desktop/Engine and the Compose v2 plugin |
| `daemon is unavailable` | Start Docker Desktop or `docker` service; verify `docker info` |
| `Node.js 22+ is required` | Install Node 22 LTS using your version manager, then reopen shell |
| `corepack is missing` | Use a Node distribution that includes Corepack or install/enable it according to Node docs |
| `.env is missing` | `cp .env.example .env` |
| `SESSION_SECRET must be replaced` | Generate with `openssl rand -base64 48` and paste the output |
| `application manifests are not present` | Expected during M0; implementation begins in M1 |

## 3. Current verification (planning phase)

```bash
bash -n scripts/doctor.sh
./scripts/test-doctor.sh
./scripts/doctor.sh
```

The test uses stubbed prerequisites to verify both success and missing-secret diagnostics. The final command should finish with zero errors after real prerequisites/configuration are correct. A planning-phase warning is expected.

## 4. Application workflow (available after M1)

These commands are the setup contract; M1 must implement and CI-test them before removing this notice:

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate
docker compose up --build
curl --fail http://localhost:4000/health/ready
```

Expected local services: web `http://localhost:3000`, API `http://localhost:4000`, Postgres private to Compose (optional host port only in development).

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
