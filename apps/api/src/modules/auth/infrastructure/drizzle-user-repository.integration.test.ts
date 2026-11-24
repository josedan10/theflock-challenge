import { normalizeEmail, normalizeUsername } from "@twitter-clone/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { IdentityConflictError } from "../domain/errors.js";

import { users } from "./auth.schema.js";
import { createDrizzleUserRepository } from "./drizzle-user-repository.js";

import type { UserRepository } from "../application/ports.js";

let database: TestDatabase;
let repository: UserRepository;

beforeAll(async () => {
  database = await startTestDatabase();
  repository = createDrizzleUserRepository(database.db);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
});

async function expectConflict(promise: Promise<unknown>, field: string) {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(IdentityConflictError);
  expect((error as IdentityConflictError).field).toBe(field);
}

describe("user persistence", () => {
  it("US-A01 AC-A01.1 creates a member with defaults and returns the stored row", async () => {
    const input = buildNewUser({
      email: "Ada@Example.com",
      emailNormalized: "ada@example.com",
    });

    const created = await repository.create(input);

    expect(created).toEqual({
      id: input.id,
      email: "Ada@Example.com",
      emailNormalized: "ada@example.com",
      username: input.username,
      displayName: input.displayName,
      bio: "",
      avatarKey: null,
      passwordHash: input.passwordHash,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    await expect(
      repository.findByEmailNormalized("ada@example.com"),
    ).resolves.toEqual(created);
    await expect(repository.findByUsername(input.username)).resolves.toEqual(
      created,
    );
  });

  it("returns null for unknown identifiers", async () => {
    await expect(
      repository.findByEmailNormalized("nobody@example.com"),
    ).resolves.toBeNull();
    await expect(repository.findByUsername("nobody")).resolves.toBeNull();
  });

  it("US-A01 AC-A01.2 rejects a duplicate email regardless of case", async () => {
    await repository.create(
      buildNewUser({
        email: "ada@example.com",
        emailNormalized: normalizeEmail("ada@example.com"),
      }),
    );

    await expectConflict(
      repository.create(
        buildNewUser({
          email: "ADA@Example.COM",
          emailNormalized: normalizeEmail("ADA@Example.COM"),
        }),
      ),
      "email",
    );
  });

  it("US-A01 AC-A01.2 rejects a duplicate username regardless of case", async () => {
    await repository.create(
      buildNewUser({ username: normalizeUsername("Ada_L") }),
    );

    await expectConflict(
      repository.create(buildNewUser({ username: normalizeUsername("ADA_l") })),
      "username",
    );
  });

  it("US-A01 AC-A01.2 lets exactly one of two concurrent registrations win", async () => {
    const results = await Promise.allSettled([
      repository.create(buildNewUser({ username: "racer" })),
      repository.create(buildNewUser({ username: "racer" })),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(IdentityConflictError);
    await expect(database.db.$count(users)).resolves.toBe(1);
  });

  it("US-A01 AC-A01.3 does not write a user when a conflict is rejected", async () => {
    await repository.create(buildNewUser({ username: "taken" }));
    await repository
      .create(buildNewUser({ username: "taken" }))
      .catch(() => undefined);

    await expect(database.db.$count(users)).resolves.toBe(1);
  });

  describe("database invariants backing the contracts", () => {
    it.each([
      [
        "a non-lowercase normalized email",
        { emailNormalized: "Ada@example.com" },
      ],
      [
        "an untrimmed normalized email",
        { emailNormalized: " ada@example.com" },
      ],
      ["an uppercase username", { username: "Ada" }],
      ["a username starting with a digit", { username: "1ada" }],
      ["a too-short username", { username: "ab" }],
      ["a blank display name", { displayName: "   " }],
      [
        "a non-Argon2id password hash",
        { passwordHash: "$2b$10$bcrypthashvalue" },
      ],
      ["an over-long email", { email: `${"a".repeat(250)}@x.io` }],
    ])("US-A01 AC-A01.4 rejects %s", async (_case, overrides) => {
      await expect(
        repository.create(buildNewUser(overrides)),
      ).rejects.toThrow();
      await expect(database.db.$count(users)).resolves.toBe(0);
    });
  });
});
