#!/usr/bin/env bats

setup() {
  # BASH_SOURCE inside setup() is the Bats library, not this file.
  ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
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