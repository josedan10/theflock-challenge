import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildNewSession,
  buildNewUser,
} from "../../../tests/auth-factories.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { IdentityConflictError } from "../domain/errors.js";

import { sessions, users } from "./auth.schema.js";
import { createDrizzleAuthUnitOfWork } from "./drizzle-auth-unit-of-work.js";

import type { AuthUnitOfWork } from "../application/ports.js";

let database: TestDatabase;
let unitOfWork: AuthUnitOfWork;

beforeAll(async () => {
  database = await startTestDatabase();
  unitOfWork = createDrizzleAuthUnitOfWork(database.db);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
});

describe("auth unit of work", () => {
  it("US-A01 AC-A01.1 commits the user and session together", async () => {
    const user = buildNewUser();

    const result = await unitOfWork.run(async (repositories) => {
      const created = await repositories.users.create(user);
      await repositories.sessions.create(buildNewSession(created.id));
      return created.id;
    });

    expect(result).toBe(user.id);
    await expect(database.db.$count(users)).resolves.toBe(1);
    await expect(database.db.$count(sessions)).resolves.toBe(1);
  });

  it("US-A01 AC-A01.3 rolls back the user when creating the session fails", async () => {
    const failure = unitOfWork.run(async (repositories) => {
      const created = await repositories.users.create(buildNewUser());
      // A raw (non-digest) token violates the session check constraint.
      await repositories.sessions.create(
        buildNewSession(created.id, { tokenHash: Buffer.from("raw") }),
      );
    });

    await expect(failure).rejects.toThrow();
    await expect(database.db.$count(users)).resolves.toBe(0);
    await expect(database.db.$count(sessions)).resolves.toBe(0);
  });

  it("US-A01 AC-A01.2 surfaces identity conflicts raised inside the transaction", async () => {
    await unitOfWork.run(({ users: repository }) =>
      repository.create(buildNewUser({ username: "taken" })),
    );

    const failure = unitOfWork.run(({ users: repository }) =>
      repository.create(buildNewUser({ username: "taken" })),
    );

    await expect(failure).rejects.toBeInstanceOf(IdentityConflictError);
    await expect(database.db.$count(users)).resolves.toBe(1);
  });
});
