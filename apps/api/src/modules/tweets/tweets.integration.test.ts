import {
  authSessionResponseSchema,
  createTweetResponseSchema,
  errorResponseSchema,
} from "@twitter-clone/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { tweets } from "../../platform/database/schema.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";

import type { FastifyInstance, LightMyRequestResponse } from "fastify";

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
    // Rate limiting has its own route tests; this suite exercises the flow.
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

const post = (
  member: Member | null,
  content: unknown,
  csrf = member?.csrfToken,
) =>
  app.inject({
    cookies: member === null ? {} : { sid: member.token },
    headers: csrf === undefined ? {} : { "x-csrf-token": csrf },
    method: "POST",
    payload: { content } as object,
    url: "/v1/tweets",
  });

const remove = (
  member: Member | null,
  tweetId: string,
  csrf = member?.csrfToken,
) =>
  app.inject({
    cookies: member === null ? {} : { sid: member.token },
    headers: csrf === undefined ? {} : { "x-csrf-token": csrf },
    method: "DELETE",
    url: `/v1/tweets/${tweetId}`,
  });

const tweetIdOf = (response: LightMyRequestResponse) =>
  createTweetResponseSchema.parse(response.json()).tweet.id;

let ada: Member;
let grace: Member;

beforeEach(async () => {
  await database.reset();
  ada = await registerMember("ada");
  grace = await registerMember("grace");
});

describe("tweets end to end", () => {
  it("US-B01 AC-B01.1 publishes a tweet with the canonical card and stores it", async () => {
    const response = await post(ada, "  First post!  ");

    expect(response.statusCode).toBe(201);
    const { tweet } = createTweetResponseSchema.parse(response.json());
    expect(tweet).toMatchObject({
      author: {
        avatarUrl: null,
        displayName: "ada",
        id: ada.userId,
        username: "ada",
      },
      content: "First post!",
      createdAt: NOW.toISOString(),
      likeCount: 0,
      likedByViewer: false,
    });
    const [stored] = await database.db
      .select()
      .from(tweets)
      .where(eq(tweets.id, tweet.id));
    expect(stored).toMatchObject({
      authorId: ada.userId,
      content: "First post!",
    });
  });

  it("US-B01 AC-B01.2 stores nothing for empty, whitespace-only, or over-limit content", async () => {
    for (const content of ["", "   ", "a".repeat(281)]) {
      expect((await post(ada, content)).statusCode).toBe(422);
    }
    await expect(database.db.$count(tweets)).resolves.toBe(0);
  });

  it("US-B01 AC-B01.3 rejects an unauthenticated post with 401", async () => {
    const response = await post(null, "hello", undefined);

    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "UNAUTHENTICATED",
    );
    await expect(database.db.$count(tweets)).resolves.toBe(0);
  });

  it("US-A02 AC-A02.5 rejects a post with another member's CSRF token", async () => {
    const response = await post(ada, "hello", grace.csrfToken);

    expect(response.statusCode).toBe(403);
    await expect(database.db.$count(tweets)).resolves.toBe(0);
  });

  it("US-B02 AC-B02.1 lets the author delete their tweet, which is gone afterwards", async () => {
    const tweetId = tweetIdOf(await post(ada, "short-lived"));

    expect((await remove(ada, tweetId)).statusCode).toBe(204);
    await expect(database.db.$count(tweets)).resolves.toBe(0);
  });

  it("US-B02 AC-B02.2 answers another member with 403 and keeps the tweet", async () => {
    const tweetId = tweetIdOf(await post(ada, "mine"));

    const response = await remove(grace, tweetId);

    expect(response.statusCode).toBe(403);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "FORBIDDEN",
    );
    await expect(database.db.$count(tweets)).resolves.toBe(1);
  });

  it("US-B02 AC-B02.2 answers a repeat delete and an unknown tweet with 404", async () => {
    const tweetId = tweetIdOf(await post(ada, "once"));
    await remove(ada, tweetId);

    expect((await remove(ada, tweetId)).statusCode).toBe(404);
    expect(
      (await remove(ada, "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f99")).statusCode,
    ).toBe(404);
  });

  it("US-B01 AC-B01.3 rejects an unauthenticated delete with 401", async () => {
    const tweetId = tweetIdOf(await post(ada, "keep me"));

    expect((await remove(null, tweetId, undefined)).statusCode).toBe(401);
    await expect(database.db.$count(tweets)).resolves.toBe(1);
  });
});
