import { createHash } from "node:crypto";

import {
  authSessionResponseSchema,
  errorResponseSchema,
} from "@twitter-clone/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";

import { sessions, users } from "./infrastructure/auth.schema.js";

import type { FastifyInstance } from "fastify";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const TTL_SECONDS = 3_600;

let database: TestDatabase;
let app: FastifyInstance;

beforeAll(async () => {
  database = await startTestDatabase();
  app = await buildApp({
    auth: {
      clock: () => NOW,
      db: database.db,
      // Rate limiting has its own tests; this suite exercises persistence.
      registrationRateLimit: { max: 1_000, timeWindowMs: 60_000 },
      sessionCookie: {
        domain: undefined,
        secure: true,
        ttlSeconds: TTL_SECONDS,
      },
    },
    corsOrigin: "http://localhost:3000",
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
});

const validBody = {
  email: "Ada@Example.com",
  password: "correct horse battery",
  username: "Ada_Lovelace",
};

const register = (payload: object) =>
  app.inject({ method: "POST", payload, url: "/v1/auth/register" });

describe("registration end to end", () => {
  it("US-A01 AC-A01.1 creates the account and an authenticated session", async () => {
    const response = await register(validBody);

    expect(response.statusCode).toBe(201);
    const body = authSessionResponseSchema.parse(response.json());
    const [sessionCookie] = response.cookies;
    expect(sessionCookie?.name).toBe("sid");

    const [storedUser] = await database.db.select().from(users);
    const [storedSession] = await database.db.select().from(sessions);
    expect(storedUser).toMatchObject({
      email: "Ada@Example.com",
      emailNormalized: "ada@example.com",
      id: body.user.id,
      username: "ada_lovelace",
    });
    expect(storedSession).toMatchObject({
      expiresAt: new Date(NOW.getTime() + TTL_SECONDS * 1000),
      revokedAt: null,
      userId: body.user.id,
    });
    // Only digests are stored: the cookie and CSRF token hash to the stored values.
    const sha256 = (value: string) =>
      createHash("sha256").update(value).digest();
    expect(
      storedSession?.tokenHash.equals(sha256(sessionCookie?.value ?? "")),
    ).toBe(true);
    expect(storedSession?.csrfSecretHash.equals(sha256(body.csrfToken))).toBe(
      true,
    );
  });

  it("US-A01 AC-A01.4 stores the password only as an Argon2id hash", async () => {
    await register(validBody);

    const [storedUser] = await database.db
      .select({ passwordHash: users.passwordHash })
      .from(users);
    expect(storedUser?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(storedUser?.passwordHash).not.toContain(validBody.password);
  });

  it.each([
    ["email", { email: "ADA@example.COM", username: "someone" }],
    ["username", { email: "other@example.com", username: "ADA_LOVELACE" }],
  ])(
    "US-A01 AC-A01.2 rejects a duplicate %s regardless of case with 409",
    async (field, overrides) => {
      await register(validBody);

      const response = await register({ ...validBody, ...overrides });

      expect(response.statusCode).toBe(409);
      expect(
        errorResponseSchema.parse(response.json()).error.fields,
      ).toHaveProperty(field);
      await expect(database.db.$count(users)).resolves.toBe(1);
      await expect(database.db.$count(sessions)).resolves.toBe(1);
    },
  );

  it("US-A01 AC-A01.3 writes no user or session for invalid input", async () => {
    const response = await register({ ...validBody, email: "not-an-email" });

    expect(response.statusCode).toBe(422);
    await expect(database.db.$count(users)).resolves.toBe(0);
    await expect(database.db.$count(sessions)).resolves.toBe(0);
  });

  it("US-A01 AC-A01.2 lets only one of two concurrent identical registrations succeed", async () => {
    const responses = await Promise.all([
      register(validBody),
      register({ ...validBody, email: "ada2@example.com" }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    await expect(database.db.$count(users)).resolves.toBe(1);
    await expect(database.db.$count(sessions)).resolves.toBe(1);
  });

  it("US-A01 AC-A01.1 returns the stored username and default display name", async () => {
    const response = await register(validBody);
    const { user } = authSessionResponseSchema.parse(response.json());

    const [storedUser] = await database.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, user.id));
    expect(user).toMatchObject({
      displayName: "Ada_Lovelace",
      username: "ada_lovelace",
    });
    expect(storedUser?.displayName).toBe("Ada_Lovelace");
  });
});
