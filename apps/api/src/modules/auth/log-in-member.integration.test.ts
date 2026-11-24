import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIXED_NOW } from "../../tests/auth-factories.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";

import {
  createLogInMember,
  type LogInMember,
} from "./application/log-in-member.js";
import {
  createRegisterMember,
  type RegisterMember,
} from "./application/register-member.js";
import { InvalidCredentialsError } from "./domain/errors.js";
import { createArgon2PasswordHasher } from "./infrastructure/argon2-password-hasher.js";
import { createCryptoSessionCredentialGenerator } from "./infrastructure/crypto-session-credentials.js";
import { createDrizzleAuthUnitOfWork } from "./infrastructure/drizzle-auth-unit-of-work.js";
import { createDrizzleSessionRepository } from "./infrastructure/drizzle-session-repository.js";

const credentials = createCryptoSessionCredentialGenerator(
  "test-secret-with-at-least-32-characters",
);
// Low cost keeps the suite fast; production uses the OWASP minimum.
const passwordHasher = createArgon2PasswordHasher({
  memoryCostKiB: 1_024,
  parallelism: 1,
  timeCost: 1,
});

let database: TestDatabase;
let registerMember: RegisterMember;
let logInMember: LogInMember;
let idCount = 0;

beforeAll(async () => {
  database = await startTestDatabase();
  const dependencies = {
    clock: () => FIXED_NOW,
    credentials,
    generateId: () =>
      `0190f3a4-7c2b-7d1e-8a3f-${String((idCount += 1)).padStart(12, "0")}`,
    passwordHasher,
    sessionTtlSeconds: 3_600,
    unitOfWork: createDrizzleAuthUnitOfWork(database.db),
  };
  registerMember = createRegisterMember(dependencies);
  logInMember = createLogInMember(dependencies);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
  await registerMember({
    email: "ada@example.com",
    password: "correct horse battery",
    username: "ada",
  });
});

const sessionsRepository = () => createDrizzleSessionRepository(database.db);

describe("log in member", () => {
  it("US-A02 AC-A02.1 opens a new active session for valid credentials", async () => {
    const result = await logInMember({
      email: "ADA@example.com",
      password: "correct horse battery",
    });

    expect(result.user.username).toBe("ada");
    const active = await sessionsRepository().findActiveByTokenHash(
      credentials.hash(result.credentials.token),
      FIXED_NOW,
    );
    expect(active?.session.id).toBe(result.session.id);
  });

  it.each([
    [
      "an unknown email",
      { email: "nobody@example.com", password: "correct horse battery" },
    ],
    [
      "a wrong password",
      { email: "ada@example.com", password: "wrong password!" },
    ],
  ])("US-A02 AC-A02.2 rejects %s with the same error", async (_case, input) => {
    const error: unknown = await logInMember(input).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(InvalidCredentialsError);
    expect((error as Error).message).toBe("Invalid email or password.");
  });

  it("US-A02 AC-A02.1 rotates: the session presented at login is revoked", async () => {
    const first = await logInMember({
      email: "ada@example.com",
      password: "correct horse battery",
    });

    const second = await logInMember({
      email: "ada@example.com",
      password: "correct horse battery",
      previousSessionToken: first.credentials.token,
    });

    const repository = sessionsRepository();
    await expect(
      repository.findActiveByTokenHash(
        credentials.hash(first.credentials.token),
        FIXED_NOW,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.findActiveByTokenHash(
        credentials.hash(second.credentials.token),
        FIXED_NOW,
      ),
    ).resolves.not.toBeNull();
  });

  it("ignores an unknown previous session token", async () => {
    await expect(
      logInMember({
        email: "ada@example.com",
        password: "correct horse battery",
        previousSessionToken: "not-a-real-token",
      }),
    ).resolves.toHaveProperty("session");
  });
});
