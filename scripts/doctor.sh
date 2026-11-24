#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ERRORS=0
WARNINGS=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARNINGS=$((WARNINGS + 1)); }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; ERRORS=$((ERRORS + 1)); }

printf 'Twitter Clone setup doctor\nRepository: %s\n\n' "$ROOT"
printf 'Required tools\n'

if command -v git >/dev/null 2>&1; then ok "git: $(git --version)"; else fail "git is missing — install from https://git-scm.com/downloads"; fi
if command -v docker >/dev/null 2>&1; then
  ok "docker: $(docker --version)"
  if docker info >/dev/null 2>&1; then ok "Docker daemon is running"; else fail "Docker is installed but its daemon is unavailable — start Docker Desktop/Engine"; fi
  if docker compose version >/dev/null 2>&1; then ok "$(docker compose version)"; else fail "Docker Compose v2 is missing — install the Compose plugin"; fi
else
  fail "docker is missing — install Docker Desktop or Docker Engine with Compose v2"
fi

if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf 0)"
  if [ "$NODE_MAJOR" -ge 22 ]; then ok "node: $(node --version)"; else fail "Node.js 22+ is required; found $(node --version)"; fi
else fail "node is missing — install Node.js 22 LTS"; fi

if command -v corepack >/dev/null 2>&1; then ok "corepack is available"; else fail "corepack is missing — install/enable it with your Node.js 22 installation"; fi

printf '\nConfiguration\n'
ENV_FILE="$ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  fail ".env is missing — run: cp .env.example .env"
else
  ok ".env exists"
  required_vars="DATABASE_URL SESSION_SECRET WEB_URL API_URL NEXT_PUBLIC_API_URL CORS_ORIGIN POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD POSTGRES_PORT WEB_PORT API_PORT"
  for name in $required_vars; do
    value="$(sed -n "s/^${name}=//p" "$ENV_FILE" | tail -n 1)"
    if [ -z "$value" ]; then fail "$name is missing or empty in .env"; else ok "$name is set"; fi
  done
  secret="$(sed -n 's/^SESSION_SECRET=//p' "$ENV_FILE" | tail -n 1)"
  if [ "$secret" = "replace_me_with_at_least_32_characters" ] || [ "${#secret}" -lt 32 ]; then
    fail "SESSION_SECRET must be replaced with at least 32 random characters (try: openssl rand -base64 48)"
  fi
  password="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ENV_FILE" | tail -n 1)"
  if [ "${NODE_ENV:-development}" = "production" ] && [ "$password" = "twitter_clone_local_only" ]; then
    fail "the development database password cannot be used in production"
  fi
  for name in POSTGRES_PORT WEB_PORT API_PORT; do
    value="$(sed -n "s/^${name}=//p" "$ENV_FILE" | tail -n 1)"
    case "$value" in
      ''|*[!0-9]*) fail "$name must be a numeric TCP port" ;;
      *) if [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then fail "$name must be between 1 and 65535"; fi ;;
    esac
  done
fi

printf '\nRepository state\n'
if [ -f "$ROOT/package.json" ] && [ -f "$ROOT/pnpm-lock.yaml" ]; then ok "Node workspace manifests are present"; else fail "package.json or pnpm-lock.yaml is missing"; fi
if [ -f "$ROOT/compose.yaml" ]; then ok "Compose manifest is present"; else fail "compose.yaml is missing"; fi

printf '\nResult: %d error(s), %d warning(s).\n' "$ERRORS" "$WARNINGS"
if [ "$ERRORS" -gt 0 ]; then exit 1; fi
exit 0
