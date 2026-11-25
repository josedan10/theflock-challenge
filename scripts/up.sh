#!/usr/bin/env bash
# Starts the whole local stack: PostgreSQL, migrations, API, and web.
#
# Safe to re-run: it never overwrites .env, installs dependencies only when
# they are missing, applies only pending migrations, and recreates containers
# only when their image or configuration changed.
#
# Usage: pnpm stack:up [--seed-users 10..100]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

if [[ $# -ne 0 && ( $# -ne 2 || "$1" != "--seed-users" ) ]]; then
  fail "Usage: pnpm stack:up [--seed-users 10..100]"
fi
seed_override="${2-}"

# 1. Environment file: create it once from the template with a real secret.
if [ ! -f .env ]; then
  step "Creating .env from .env.example"
  command -v openssl >/dev/null 2>&1 || fail "openssl is needed to generate SESSION_SECRET; create .env manually (see README)."
  secret="$(openssl rand -base64 48 | tr -d '\n/+=' )"
  sed "s|^SESSION_SECRET=.*|SESSION_SECRET=${secret}|" .env.example > .env
  echo "  .env created with a generated SESSION_SECRET (never commit it)."
fi

# 2. Workstation and configuration checks; doctor exits non-zero on errors.
step "Checking tools and configuration"
./scripts/doctor.sh || fail "Fix the doctor errors above, then re-run this script."

# Host ports and URLs, honouring shell overrides before .env values.
env_value() {
  local name="$1" fallback="$2" value="${!1:-}"
  if [ -z "$value" ]; then value="$(sed -n "s/^${name}=//p" .env | tail -n 1)"; fi
  printf '%s' "${value:-$fallback}"
}
API_PORT_VALUE="$(env_value API_PORT 4000)"
WEB_PORT_VALUE="$(env_value WEB_PORT 3000)"

seed_count="${seed_override:-$(env_value SEED_USER_COUNT 10)}"
if [[ ! "$seed_count" =~ ^([1-9][0-9]|100)$ || ( $# -eq 2 && -z "$seed_override" ) ]]; then
  fail "Seed user count must be an integer from 10 to 100."
fi
activity="$(env_value ACTIVITY_SIMULATOR false)"
if [[ "$activity" != "true" && "$activity" != "false" ]]; then
  fail "ACTIVITY_SIMULATOR must be true or false."
fi

# 3. Host dependencies, needed for migrations (drizzle-kit runs on the host).
if [ ! -d node_modules ]; then
  step "Installing dependencies"
  corepack enable >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile
fi

# 4. Database first, then pending migrations.
step "Starting PostgreSQL"
docker compose --profile dev up -d --wait postgres

step "Applying database migrations"
pnpm db:migrate

step "Seeding local demo data"
SEED_USER_COUNT="$seed_count" pnpm --filter @twitter-clone/api db:seed

# 5. Everything else. --wait returns once health checks pass.
step "Building and starting the API and web app"
docker compose --profile dev up -d --build --wait

step "Verifying"
curl --fail --silent --show-error "http://localhost:${API_PORT_VALUE}/health/ready" >/dev/null \
  || fail "API is not ready; inspect it with: pnpm compose:logs"
docker compose ps

# 6. Optional local activity (DEV-01). Off unless ACTIVITY_SIMULATOR=true.
if [ "$activity" = "true" ]; then
  step "Starting the activity simulator"
  ACTIVITY_SIMULATOR=true docker compose --profile dev --profile activity up -d --build activity
  echo "  Demo accounts post every $(env_value ACTIVITY_INTERVAL_SECONDS 30)s. Stop: pnpm activity:stop"
fi

printf '\n\033[32m✓ Stack is up\033[0m\n'
printf '  Web:  http://localhost:%s\n' "$WEB_PORT_VALUE"
printf '  API:  http://localhost:%s/health/ready\n' "$API_PORT_VALUE"
printf '\n  Logs: pnpm compose:logs    Stop: pnpm compose:down\n'
