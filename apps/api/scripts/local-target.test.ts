import { expect, it } from "vitest";

import { localTarget } from "./local-target.js";

it("SEED-01 AC-G01.3 rejects remote targets, overrides and non-development environments", () => {
  const local = "postgresql://demo@localhost:5433/demo";
  expect(localTarget(local)).toMatchObject({
    host: "localhost",
    port: 5433,
    database: "demo",
  });
  for (const invalid of [
    undefined,
    "https://localhost/demo",
    "postgres://remote.example/demo",
    local + "?host=remote.example",
    "postgres://localhost/",
  ]) {
    expect(() => localTarget(invalid)).toThrow();
  }
  expect(() => localTarget(local, "production")).toThrow();
});

it("DEV-01 accepts a named Compose database host only when asked", () => {
  const compose = "postgresql://demo@postgres:5432/demo";
  expect(() => localTarget(compose)).toThrow();
  expect(localTarget(compose, "development", ["postgres"])).toMatchObject({
    host: "postgres",
  });
  expect(() => localTarget(compose, "production", ["postgres"])).toThrow();
});
