#!/usr/bin/env bash
# Starts the whole local stack: PostgreSQL, migrations, API, and web.
#
# Safe to re-run: it never overwrites .env, installs dependencies only when
# they are missing, applies only pending migrations, and recreates containers
# only when their image or configuration changed.
#
# Usage: ./scripts/up.sh   (or: pnpm stack:up)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

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

# 5. Everything else. --wait returns once health checks pass.
step "Building and starting the API and web app"
docker compose --profile dev up -d --build --wait

step "Verifying"
curl --fail --silent --show-error "http://localhost:${API_PORT_VALUE}/health/ready" >/dev/null \
  || fail "API is not ready; inspect it with: pnpm compose:logs"
docker compose ps

printf '\n\033[32m✓ Stack is up\033[0m\n'
printf '  Web:  http://localhost:%s\n' "$WEB_PORT_VALUE"
printf '  API:  http://localhost:%s/health/ready\n' "$API_PORT_VALUE"
printf '\n  Logs: pnpm compose:logs    Stop: pnpm compose:down\n'
