#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/project/scripts" "$TMP/bin"
cp "$ROOT/scripts/doctor.sh" "$TMP/project/scripts/doctor.sh"
cp "$ROOT/.env.example" "$TMP/project/.env"
sed -i.bak 's|replace_me_with_at_least_32_characters|0123456789012345678901234567890123456789|' "$TMP/project/.env"
rm -f "$TMP/project/.env.bak"

cat >"$TMP/bin/git" <<'EOF'
#!/usr/bin/env bash
echo 'git version test'
EOF
cat >"$TMP/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  --version) echo 'Docker version test' ;;
  info) exit 0 ;;
  compose) echo 'Docker Compose version test' ;;
  *) exit 0 ;;
esac
EOF
cat >"$TMP/bin/node" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "-p" ]; then echo 22; else echo v22.0.0; fi
EOF
cat >"$TMP/bin/corepack" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$TMP/bin/"*

OUTPUT="$(PATH="$TMP/bin:/bin:/usr/bin" "$TMP/project/scripts/doctor.sh")"
grep -q 'Result: 0 error(s), 1 warning(s).' <<<"$OUTPUT"

sed -i.bak '/^SESSION_SECRET=/d' "$TMP/project/.env"
rm -f "$TMP/project/.env.bak"
set +e
OUTPUT="$(PATH="$TMP/bin:/bin:/usr/bin" "$TMP/project/scripts/doctor.sh" 2>&1)"
CODE=$?
set -e
[ "$CODE" -eq 1 ]
grep -q 'SESSION_SECRET is missing or empty' <<<"$OUTPUT"
grep -q 'SESSION_SECRET must be replaced' <<<"$OUTPUT"

printf 'doctor tests passed\n'
