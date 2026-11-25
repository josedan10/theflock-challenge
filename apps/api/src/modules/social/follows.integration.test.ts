import {
  authSessionResponseSchema,
  createTweetResponseSchema,
  errorResponseSchema,
  followResponseSchema,
  publicProfileResponseSchema,
  timelinePageSchema,
} from "@twitter-clone/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { follows } from "../../platform/database/schema.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";
import { users } from "../auth/infrastructure/auth.schema.js";

import type { FastifyInstance } from "fastify";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const PASSWORD = "correct horse battery";

let database: TestDatabase;
let app: FastifyInstance;

beforeAll(async () => {
  database = await startTestDatabase();
  app = await buildApp({
    auth: {
      clock: () => NOW,
      db: database.db,
      passwordHasher: fastPasswordHasher,
      rateLimit: { max: 1_000, timeWindowMs: 60_000 },
      sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3_600 },
      sessionSecret: "test-secret-with-at-least-32-characters",
    },
    corsOrigin: "http://localhost:3000",
    followWriteRateLimit: { max: 1_000, timeWindowMs: 60_000 },
    tweetWriteRateLimit: { max: 1_000, timeWindowMs: 60_000 },
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
});

interface Member {
  csrfToken: string;
  token: string;
  userId: string;
}

async function registerMember(username: string): Promise<Member> {
  const response = await app.inject({
    method: "POST",
    payload: { email: `${username}@example.com`, password: PASSWORD, username },
    url: "/v1/auth/register",
  });
  expect(response.statusCode).toBe(201);
  const body = authSessionResponseSchema.parse(response.json());
  return {
    csrfToken: body.csrfToken,
    token:
      response.cookies.find((cookie) => cookie.name === "sid")?.value ?? "",
    userId: body.user.id,
  };
}

const follow = (
  member: Member | null,
  username: string,
  csrf = member?.csrfToken,
) =>
  app.inject({
    cookies: member === null ? {} : { sid: member.token },
    headers: csrf === undefined ? {} : { "x-csrf-token": csrf },
    method: "PUT",
    url: `/v1/users/${username}/follow`,
  });

const unfollow = (
  member: Member | null,
  username: string,
  csrf = member?.csrfToken,
) =>
  app.inject({
    cookies: member === null ? {} : { sid: member.token },
    headers: csrf === undefined ? {} : { "x-csrf-token": csrf },
    method: "DELETE",
    url: `/v1/users/${username}/follow`,
  });

async function postTweet(member: Member, content: string): Promise<void> {
  const response = await app.inject({
    cookies: { sid: member.token },
    headers: { "x-csrf-token": member.csrfToken },
    method: "POST",
    payload: { content },
    url: "/v1/tweets",
  });
  expect(response.statusCode).toBe(201);
  createTweetResponseSchema.parse(response.json());
}

async function timelineContents(member: Member): Promise<string[]> {
  const response = await app.inject({
    cookies: { sid: member.token },
    method: "GET",
    url: "/v1/timeline",
  });
  expect(response.statusCode).toBe(200);
  return timelinePageSchema
    .parse(response.json())
    .items.map((item) => item.content);
}

let ada: Member;
let grace: Member;

beforeEach(async () => {
  await database.reset();
  ada = await registerMember("ada");
  grace = await registerMember("grace");
});

describe("follow and unfollow end to end", () => {
  it("US-C01 AC-C01.1 follows once and the profile count matches the committed rows", async () => {
    const response = await follow(ada, "Grace");

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(followResponseSchema.parse(response.json())).toEqual({
      relationship: { followerCount: 1, following: true },
    });
    const profile = await app.inject({
      method: "GET",
      url: "/v1/users/grace",
    });
    expect(
      publicProfileResponseSchema.parse(profile.json()).profile,
    ).toMatchObject({
      followerCount: 1,
      followingCount: 0,
    });
    const adaProfile = await app.inject({
      method: "GET",
      url: "/v1/users/ada",
    });
    expect(
      publicProfileResponseSchema.parse(adaProfile.json()).profile,
    ).toMatchObject({
      followerCount: 0,
      followingCount: 1,
    });
    await expect(database.db.$count(follows)).resolves.toBe(1);
  });

  it("US-C01 AC-C01.2 treats a repeated follow and unfollow as idempotent", async () => {
    expect((await follow(ada, "grace")).statusCode).toBe(200);
    const again = await follow(ada, "grace");
    expect(followResponseSchema.parse(again.json()).relationship).toEqual({
      followerCount: 1,
      following: true,
    });

    const removed = await unfollow(ada, "grace");
    expect(followResponseSchema.parse(removed.json()).relationship).toEqual({
      followerCount: 0,
      following: false,
    });
    const removedAgain = await unfollow(ada, "grace");
    expect(
      followResponseSchema.parse(removedAgain.json()).relationship
        .followerCount,
    ).toBe(0);
    await expect(database.db.$count(follows)).resolves.toBe(0);
  });

  it("US-C01 AC-C01.2 rejects a self-follow and a self-unfollow with 422", async () => {
    for (const request of [follow(ada, "ada"), unfollow(ada, "ADA")]) {
      const response = await request;
      expect(response.statusCode).toBe(422);
      expect(errorResponseSchema.parse(response.json()).error.code).toBe(
        "VALIDATION_ERROR",
      );
    }
    await expect(database.db.$count(follows)).resolves.toBe(0);
  });

  it("US-C01 AC-C01.1 answers unknown, malformed, and soft-deleted targets with 404", async () => {
    await database.db
      .update(users)
      .set({ deletedAt: NOW })
      .where(eq(users.id, grace.userId));

    for (const username of ["grace", "nobody", "not a user", "a"]) {
      expect((await follow(ada, encodeURIComponent(username))).statusCode).toBe(
        404,
      );
    }
    await expect(database.db.$count(follows)).resolves.toBe(0);
  });

  it("US-C01 AC-C01.1 rejects an unauthenticated follow and a foreign CSRF token", async () => {
    expect((await follow(null, "grace", undefined)).statusCode).toBe(401);
    const forged = await follow(ada, "grace", grace.csrfToken);
    expect(forged.statusCode).toBe(403);
    expect(errorResponseSchema.parse(forged.json()).error.code).toBe(
      "FORBIDDEN",
    );
    await expect(database.db.$count(follows)).resolves.toBe(0);
  });

  it("US-C01 AC-C01.2 keeps one edge when two follows commit together", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => follow(ada, "grace")),
    );

    expect(responses.every((response) => response.statusCode === 200)).toBe(
      true,
    );
    expect(
      responses.every(
        (response) =>
          followResponseSchema.parse(response.json()).relationship
            .followerCount === 1,
      ),
    ).toBe(true);
    await expect(database.db.$count(follows)).resolves.toBe(1);
  });

  it("US-C01 AC-C01.3 makes followed tweets eligible on the next timeline read only", async () => {
    await postTweet(grace, "from grace");

    await expect(timelineContents(ada)).resolves.toEqual([]);

    expect((await follow(ada, "grace")).statusCode).toBe(200);
    await expect(timelineContents(ada)).resolves.toEqual(["from grace"]);

    expect((await unfollow(ada, "grace")).statusCode).toBe(200);
    await expect(timelineContents(ada)).resolves.toEqual([]);
  });
});
