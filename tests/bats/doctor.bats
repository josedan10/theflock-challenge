#!/usr/bin/env bats

setup() {
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  export ROOT
}

@test "doctor.sh has valid bash syntax" {
  run bash -n "$ROOT/scripts/doctor.sh"
  [ "$status" -eq 0 ]
}

@test "setup.sh has valid bash syntax" {
  run bash -n "$ROOT/scripts/setup.sh"
  [ "$status" -eq 0 ]
}

@test "doctor diagnostics pass with stubbed tools and a valid .env" {
  run bash "$ROOT/scripts/test-doctor.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"doctor tests passed"* ]]
}