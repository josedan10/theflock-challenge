#!/usr/bin/env bash
# Exercise the real setup argument path without starting/stopping any developer services.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/scripts" "$tmp/node_modules" "$tmp/bin"
cp "$root/scripts/"{setup,up}.sh "$tmp/scripts/"
cp "$root/.env.example" "$tmp/.env"
for cmd in scripts/doctor.sh bin/docker bin/curl; do
  printf '#!/usr/bin/env bash\nexit 0\n' > "$tmp/$cmd"
  chmod +x "$tmp/$cmd"
done
cat > "$tmp/bin/pnpm" <<'STUB'
#!/usr/bin/env bash
echo "$*:${SEED_USER_COUNT:-}" >> "$SEED_LOG"
STUB
chmod +x "$tmp/bin/pnpm"
export PATH="$tmp/bin:$PATH" SEED_LOG="$tmp/calls"
unset SEED_USER_COUNT
"$tmp/scripts/setup.sh" >/dev/null
grep -Fxq -- '--filter @twitter-clone/api db:seed:10' "$SEED_LOG"
SEED_USER_COUNT=20 "$tmp/scripts/setup.sh" --seed-users 25 >/dev/null
grep -Fxq -- '--filter @twitter-clone/api db:seed:25' "$SEED_LOG"
: > "$SEED_LOG"
if "$tmp/scripts/setup.sh" --seed-users 9 >/dev/null 2>&1; then exit 1; fi
test ! -s "$SEED_LOG"
# DEV-01: the activity simulator starts only when the flag is exactly true.
cat > "$tmp/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$SEED_LOG"
STUB
unset ACTIVITY_SIMULATOR
: > "$SEED_LOG"
"$tmp/scripts/setup.sh" >/dev/null
if grep -q -- '--profile activity' "$SEED_LOG"; then exit 1; fi
ACTIVITY_SIMULATOR=true "$tmp/scripts/setup.sh" >/dev/null
grep -Fxq -- 'docker compose --profile dev --profile activity up -d --build activity' "$SEED_LOG"
: > "$SEED_LOG"
if ACTIVITY_SIMULATOR=yes "$tmp/scripts/setup.sh" >/dev/null 2>&1; then exit 1; fi
test ! -s "$SEED_LOG"
