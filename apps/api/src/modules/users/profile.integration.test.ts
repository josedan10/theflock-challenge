import {
  authSessionResponseSchema,
  errorResponseSchema,
  publicProfileResponseSchema,
} from "@twitter-clone/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { users } from "../../platform/database/schema.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";

import type { FastifyInstance, LightMyRequestResponse } from "fastify";

const START = new Date("2026-11-24T12:00:00.000Z");
const TTL_SECONDS = 3_600;
const PASSWORD = "correct horse battery";

let database: TestDatabase;
let app: FastifyInstance;
let now: Date;

beforeAll(async () => {
  database = await startTestDatabase();
  now = START;
  app = await buildApp({
    auth: {
      clock: () => now,
      db: database.db,
      passwordHasher: fastPasswordHasher,
      rateLimit: { max: 1_000, timeWindowMs: 60_000 },
      sessionCookie: {
        domain: undefined,
        secure: true,
        ttlSeconds: TTL_SECONDS,
      },
      sessionSecret: "test-secret-with-at-least-32-characters",
    },
    corsOrigin: "http://localhost:3000",
    profileRateLimit: {
      read: { max: 1_000, timeWindowMs: 60_000 },
      write: { max: 1_000, timeWindowMs: 60_000 },
    },
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
});

beforeEach(async () => {
  now = START;
  await database.reset();
});

interface Session {
  csrfToken: string;
  email: string;
  token: string;
  userId: string;
}

async function register(
  username: string,
  displayName = username,
): Promise<Session> {
  const email = `${username}@example.com`;
  const response = await app.inject({
    method: "POST",
    payload: { displayName, email, password: PASSWORD, username },
    url: "/v1/auth/register",
  });
  expect(response.statusCode).toBe(201);
  const body = authSessionResponseSchema.parse(response.json());
  return {
    csrfToken: body.csrfToken,
    email,
    token:
      response.cookies.find((cookie) => cookie.name === "sid")?.value ?? "",
    userId: body.user.id,
  };
}

const readProfile = (username: string, token?: string) =>
  app.inject({
    cookies: token === undefined ? {} : { sid: token },
    method: "GET",
    url: `/v1/users/${encodeURIComponent(username)}`,
  });

const editProfile = (
  session: Session,
  payload: object,
  csrfToken = session.csrfToken,
) =>
  app.inject({
    cookies: { sid: session.token },
    headers: { "x-csrf-token": csrfToken },
    method: "PATCH",
    payload,
    url: "/v1/me/profile",
  });

async function storedUser(userId: string) {
  const [row] = await database.db
    .select()
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

function notFound(response: LightMyRequestResponse) {
  expect(response.statusCode).toBe(404);
  return errorResponseSchema.parse(response.json()).error;
}

describe("profile API", () => {
  it("US-A03 AC-A03.1 returns a public profile to an anonymous viewer", async () => {
    const ada = await register("ada", "Ada");

    const response = await readProfile("Ada");

    expect(response.statusCode).toBe(200);
    expect(publicProfileResponseSchema.parse(response.json())).toEqual({
      profile: {
        avatarUrl: null,
        bio: "",
        createdAt: START.toISOString(),
        displayName: "Ada",
        followerCount: 0,
        followingCount: 0,
        id: ada.userId,
        tweetCount: 0,
        username: "ada",
      },
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.cookies).toHaveLength(0);
    expect(response.body).not.toContain(ada.email);
    expect(response.body).not.toContain("argon2");
    expect(response.body).not.toContain("avatarKey");
  });

  it("US-A03 AC-A03.1 resolves a padded username and ignores a stale session cookie", async () => {
    await register("ada", "Ada");

    const response = await readProfile("  Ada  ", "not-a-session");

    expect(response.statusCode).toBe(200);
    expect(response.json().profile.username).toBe("ada");
  });

  it("US-A03 AC-A03.2 uses one not-found response for unknown, impossible, and deleted usernames", async () => {
    const ada = await register("ada", "Ada");
    await database.db
      .update(users)
      .set({ deletedAt: START })
      .where(eq(users.id, ada.userId));

    const unknown = notFound(await readProfile("grace"));
    const impossible = notFound(await readProfile("ada' OR '1'='1"));
    const deleted = notFound(await readProfile("ada"));

    expect(unknown).toMatchObject({
      code: "NOT_FOUND",
      message: "That profile does not exist.",
    });
    expect(impossible.message).toBe(unknown.message);
    expect(deleted.message).toBe(unknown.message);
    expect(deleted.code).toBe(unknown.code);
    const deletedBody = JSON.stringify(deleted);
    expect(deletedBody).not.toContain(ada.email);
    expect(deletedBody).not.toContain(ada.userId);
  });

  it("US-A03 AC-A03.3 keeps markup in the bio as stored JSON text", async () => {
    const ada = await register("ada", "Ada");
    const bio = '<img src=x onerror="alert(1)">';

    const edited = await editProfile(ada, { bio });
    const read = await readProfile("ada");

    expect(edited.statusCode).toBe(200);
    expect(read.statusCode).toBe(200);
    expect(read.headers["content-type"]).toContain("application/json");
    expect(read.json().profile.bio).toBe(bio);
    expect(read.body.trimStart().startsWith("<")).toBe(false);
    expect((await storedUser(ada.userId))?.bio).toBe(bio);
  });

  it("PROFILE-02 lets a member edit their own profile without changing anyone else", async () => {
    const ada = await register("ada", "Ada");
    const grace = await register("grace", "Grace");

    const renamed = await editProfile(ada, { displayName: "Ada Lovelace" });
    const described = await editProfile(ada, { bio: "Analyst" });

    expect(renamed.statusCode).toBe(200);
    expect(
      publicProfileResponseSchema.parse(described.json()).profile,
    ).toMatchObject({
      bio: "Analyst",
      displayName: "Ada Lovelace",
      followerCount: 0,
      id: ada.userId,
      tweetCount: 0,
      username: "ada",
    });
    expect((await readProfile("grace")).json().profile).toMatchObject({
      bio: "",
      displayName: "Grace",
      id: grace.userId,
    });
    expect(await storedUser(ada.userId)).toMatchObject({
      email: ada.email,
      passwordHash: expect.stringMatching(/^\$argon2id\$/),
      username: "ada",
    });
  });

  it("US-A02 AC-A02.4 and AC-A02.5 reject missing, forged, revoked, and expired sessions", async () => {
    const ada = await register("ada", "Ada");
    const grace = await register("grace", "Grace");

    const anonymous = await app.inject({
      method: "PATCH",
      payload: { bio: "nope" },
      url: "/v1/me/profile",
    });
    const missingToken = await app.inject({
      cookies: { sid: ada.token },
      method: "PATCH",
      payload: { bio: "nope" },
      url: "/v1/me/profile",
    });
    const forged = await editProfile(ada, { bio: "nope" }, "forged-token");
    expect(anonymous.statusCode).toBe(401);
    expect(missingToken.statusCode).toBe(403);
    expect(forged.statusCode).toBe(403);

    const logout = await app.inject({
      cookies: { sid: ada.token },
      headers: { "x-csrf-token": ada.csrfToken },
      method: "POST",
      url: "/v1/auth/logout",
    });
    expect(logout.statusCode).toBe(204);
    const revoked = await editProfile(ada, { bio: "nope" });
    expect(revoked.statusCode).toBe(401);

    now = new Date(START.getTime() + (TTL_SECONDS + 1) * 1000);
    const expired = await editProfile(grace, { bio: "nope" });
    expect(expired.statusCode).toBe(401);

    expect((await storedUser(ada.userId))?.bio).toBe("");
    expect((await storedUser(grace.userId))?.bio).toBe("");
  });

  it("PROFILE-02 rejects an identity reassignment and does not write it", async () => {
    const ada = await register("ada", "Ada");

    const response = await editProfile(ada, {
      avatarKey: "objects/grace",
      bio: "Analyst",
      email: "grace@example.com",
      userId: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
      username: "grace",
    });

    expect(response.statusCode).toBe(422);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "VALIDATION_ERROR",
    );
    expect(await storedUser(ada.userId)).toMatchObject({
      bio: "",
      displayName: "Ada",
      email: ada.email,
      username: "ada",
    });
  });

  it("PROFILE-02 stamps the edit with the system clock when none is injected", async () => {
    const realtime = await buildApp({
      auth: {
        db: database.db,
        passwordHasher: fastPasswordHasher,
        rateLimit: { max: 1_000, timeWindowMs: 60_000 },
        sessionCookie: {
          domain: undefined,
          secure: true,
          ttlSeconds: TTL_SECONDS,
        },
        sessionSecret: "test-secret-with-at-least-32-characters",
      },
      corsOrigin: "http://localhost:3000",
    });
    const before = Date.now();
    const email = "clock@example.com";
    const registered = await realtime.inject({
      method: "POST",
      payload: {
        displayName: "Clock",
        email,
        password: PASSWORD,
        username: "clockuser",
      },
      url: "/v1/auth/register",
    });
    const body = authSessionResponseSchema.parse(registered.json());
    const token =
      registered.cookies.find((cookie) => cookie.name === "sid")?.value ?? "";
    const edited = await realtime.inject({
      cookies: { sid: token },
      headers: { "x-csrf-token": body.csrfToken },
      method: "PATCH",
      payload: { bio: "Now" },
      url: "/v1/me/profile",
    });
    const after = Date.now();
    await realtime.close();

    expect(edited.statusCode).toBe(200);
    const stored = await storedUser(body.user.id);
    expect(stored?.bio).toBe("Now");
    expect(stored?.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored?.updatedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("hides public profiles from a foreign web origin", async () => {
    await register("ada", "Ada");

    const denied = await app.inject({
      headers: { origin: "https://attacker.example" },
      method: "GET",
      url: "/v1/users/ada",
    });
    const allowed = await app.inject({
      headers: { origin: "http://localhost:3000" },
      method: "GET",
      url: "/v1/users/ada",
    });

    expect(denied.statusCode).toBe(200);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
  });
});
