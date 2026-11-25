# Setup guide

This guide sets up the implemented application workspace and explains failures with actionable diagnostics.

## Supported development environment

- macOS or Linux (Windows through WSL2)
- Git
- Docker Desktop or Docker Engine with Compose v2
- Node.js 26 LTS and Corepack
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
pnpm stack:doctor
```

The doctor checks Git, Docker/daemon/Compose, Node 22+, Corepack, required variables, and insecure placeholder secrets. It exits non-zero on actionable errors.

Common fixes:

| Message                                     | Fix                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `docker is missing`                         | Install Docker Desktop/Engine and the Compose v2 plugin                                     |
| `daemon is unavailable`                     | Start Docker Desktop or `docker` service; verify `docker info`                              |
| `Node.js 22+ is required`                   | Install Node 26 LTS using your version manager, then reopen the shell                       |
| `corepack is missing`                       | Node 26 does not ship Corepack; run `npm install -g corepack@0.36.0 && corepack enable`     |
| `.env is missing`                           | `cp .env.example .env`                                                                      |
| `SESSION_SECRET must be replaced`           | Generate with `openssl rand -base64 48` and paste the output                                |
| `package.json or pnpm-lock.yaml is missing` | Restore the tracked workspace manifests before continuing                                   |
| `compose.yaml is missing`                   | Restore the tracked Compose manifest before continuing                                      |
| `port ... already in use`                   | Set an unused `WEB_PORT`, `API_PORT`, or `POSTGRES_PORT` in `.env` and update matching URLs |

## 3. Install and verify tooling

```bash
npm install -g corepack@0.36.0
corepack enable
pnpm install --frozen-lockfile
pnpm stack:doctor:test
pnpm test:scripts
pnpm stack:doctor
pnpm exec playwright install chromium
```

Corepack is what provides `pnpm`, so those two bootstrap lines are the only non-pnpm commands.

The doctor test uses stubbed prerequisites to verify both success and missing-secret diagnostics. The real doctor command must finish with zero errors before continuing.

## 4. Start the application

These commands are the tested local setup contract:

**Quick start:** `pnpm stack:up` runs the steps below in order. It creates `.env` with a generated `SESSION_SECRET` if the file is missing, runs the doctor, installs dependencies, starts PostgreSQL, applies migrations, seeds the local demo, then starts and health-checks the API and web app. It is safe to re-run.

Shortcuts: `pnpm compose:up`, `pnpm compose:down`, `pnpm compose:ps`, `pnpm compose:logs`, and `pnpm db:up` (PostgreSQL only).

Manual steps:

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm compose:up
pnpm api:health
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

`pnpm test:e2e` starts its own API (port 4100) and web app (port 3100) against the database in `DATABASE_URL`: the Compose database locally, a service container in CI. It applies pending migrations first, and each run adds throwaway `e2e-…@example.com` accounts. Keep PostgreSQL running (`pnpm db:up`) before you start it.

Use Node 26 LTS for local tests (CI uses Node 26). `undici@8.13.1` is patched so Testcontainers and jsdom still load on Node 23.0–23.7, which lack `zlib.createZstdDecompress`.

To stop without deleting data: `pnpm compose:down`. To deliberately erase local DB data: `pnpm compose:destroy-data` (destructive).

## Configuration rules

- Values inside containers use service DNS (`postgres`), not `localhost`.
- Browser-visible API URL uses the host URL (`http://localhost:4000`).
- `COOKIE_SECURE=false` is for local HTTP development. Do not expose this configuration on a public network.
- `AUTH_RATE_LIMIT_PER_MINUTE` (default 5) and `TWEET_RATE_LIMIT_PER_MINUTE` (default 20) are per-client budgets. Browser tests raise both; keep the defaults in real environments.
- Keep secrets in ignored local `.env` files; never commit them or put them in browser-visible variables.

## Getting diagnostic help

Capture these safe outputs (redact URLs/tokens/passwords):

```bash
pnpm stack:doctor
pnpm compose:ps
pnpm compose:logs --tail=100 api postgres   # Ctrl+C stops following
```

Never paste the contents of `.env`, cookies, authorization headers, or a full database URL into an issue.

### Local demo data (SEED-01)

After migrations, `pnpm stack:up` seeds 10 synthetic accounts with profiles, posts, follows, likes, threaded replies and notifications. To request 25 total demo accounts run `pnpm stack:up --seed-users 25`. The flag takes precedence over `SEED_USER_COUNT` in the shell or root `.env`; supported range: 10–100. No external services are involved, and the activity simulator below stays off unless you turn it on.

Log in as `demo_1@example.test` (through `demo_N@example.test`) with the shared **local demo password** in the repository-root `.env.seed-password`. Setup generates it once with owner-only permissions. Never publish it or reuse it elsewhere. Search for `demo_` to inspect the profiles or open Home and Notifications while signed in.

With a migrated local database, run `pnpm db:seed` to reseed without restarting. Reruns restore missing fixtures and refresh seeded names, bios, posts, and replies. Passwords stay as they are, and requesting fewer users does not remove any. A conflicting real username or email aborts the seed rather than taking over the account. Keep the password file as long as you retain the database. If another worktree shares that database, use its original password file or a separate local database. For a **full reset**, only if all local data is disposable, stop the stack and explicitly remove the Compose volume as described above, then rerun setup. That reset also erases non-demo accounts.

### Local activity simulator (DEV-01)

The simulator makes the local app feel used. Seeded demo accounts post, reply and like through the API, exactly as the web app does, so mentions, notifications, pictures and the live Home banner all behave as they would for real members. It never acts as a real account, but it is aimed at them: while any real member exists, about 9 in 10 actions involve one.

To watch it live, follow the demo accounts listed in the [README](../README.md#see-it-live). Home only streams posts from people you follow.

It is **off by default**. Turn it on in the root `.env`:

```bash
ACTIVITY_SIMULATOR=true
ACTIVITY_MIN_INTERVAL_SECONDS=15 # shortest gap between actions; 15–3600
ACTIVITY_MAX_INTERVAL_SECONDS=40 # longest gap; each gap is random in between
```

- **At startup:** `pnpm stack:up` starts the `activity` Compose service when the flag is `true`. Any value other than `true` or `false` stops setup before it changes anything.
- **On demand:** `ACTIVITY_SIMULATOR=true pnpm activity` runs it in the foreground against the API on `http://localhost:4000`. Add `--once` for a single action. Each `--once` run logs in again, so more than five in a minute hit the API's login limit (HTTP 429); the long-running mode reuses its sessions.
- **Stop:** `pnpm activity:stop` for the Compose service, or Ctrl+C in the foreground. An action in progress finishes first.
- **Reset:** `pnpm activity:reset` deletes what the simulator posted, along with the replies, likes and notifications attached to it, and takes back the likes it gave, with their notifications. It works from the list the simulator keeps in `.data/activity-posts.txt`, so anything you did while signed in as a demo account stays. Uploaded picture files stay in the media folder but are no longer served.

How each action is chosen (constants in `apps/api/scripts/activity/plan.ts`):

- **A real member has posted** (their 20 latest posts and replies are considered): 35% of actions like one of those posts, 50% are replies (9 in 10 of them to a real member), and 15% are new posts. Measured over many actions, about 94% involve a real member.
- **Real members exist but have not posted yet:** demo accounts write new posts, and 8 in 10 of them use a line with a mention, so about 3 in 4 actions mention a real member.
- **Nobody real is around:** demo accounts reply to each other 4 times in 10, post otherwise, and never like.
- **Browser-test accounts** (`e2e_…`, created by `pnpm test:e2e` in the same database) are not people, so the simulator ignores them.

Lines come from `apps/api/scripts/activity-corpus`: 200 posts and replies, 30 of them with a picture. A `{mention}` slot is filled with another member's `@username`, choosing a real local member 9 times in 10 when there is one. A reply to a corpus post uses one of that post's own replies; a reply to anything else uses a random corpus reply. Pictures need `UPLOADS_ENABLED=true` on the API; without it, the same posts go out as text.

Safety limits:

- It runs only with `NODE_ENV=development`.
- It talks only to a local API (`localhost` or the Compose `api` service) and a local database (`localhost` or the Compose `postgres` service).
- It acts once per random gap of 15–40 seconds by default, never more than once at a time. The 15-second floor keeps logins within the API's 5-per-minute budget.
- Sessions stay in memory. Errors print only the action and the HTTP status.
