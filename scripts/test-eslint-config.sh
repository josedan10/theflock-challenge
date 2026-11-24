#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="$(mktemp)"
trap 'rm -f "$OUTPUT"' EXIT

expect_rule() {
  local filename="$1"
  local rule="$2"
  local source="$3"

  if printf '%s\n' "$source" | pnpm --dir "$ROOT" exec eslint \
    --stdin --stdin-filename "$filename" >"$OUTPUT" 2>&1; then
    printf 'expected %s to reject %s\n' "$rule" "$filename" >&2
    exit 1
  fi

  if ! grep -q "$rule" "$OUTPUT"; then
    cat "$OUTPUT" >&2
    printf 'expected %s to report %s\n' "$filename" "$rule" >&2
    exit 1
  fi
}

expect_rule \
  'apps/api/src/users/domain/member.ts' \
  'no-restricted-imports' \
  'import Fastify from "fastify"; export const member = Fastify;'

expect_rule \
  'apps/api/src/users/domain/member.ts' \
  '@typescript-eslint/no-explicit-any' \
  'export const member: any = {};'

expect_rule \
  'packages/contracts/src/member.ts' \
  'jsdoc/require-jsdoc' \
  'export interface Member { id: string }'

expect_rule \
  'apps/web/src/member.tsx' \
  'jsx-a11y/alt-text' \
  'export function Avatar() { return <img />; }'

printf 'eslint configuration tests passed\n'
