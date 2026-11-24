#!/usr/bin/env bash
# Idempotent local bootstrap: env file, doctor, dependencies, migrations, stack.
# See docs/SETUP.md. Safe to re-run — delegates to scripts/up.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT/scripts/up.sh" "$@"