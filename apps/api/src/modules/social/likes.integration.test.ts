import {
  authSessionResponseSchema,
  createTweetResponseSchema,
  errorResponseSchema,
  likeResponseSchema,
  timelinePageSchema,
} from "@twitter-clone/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { likes } from "../../platform/database/schema.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";

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
    likeWriteRateLimit: { max: 1_000, timeWindowMs: 60_000 },
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
  };
}

const signed = (
  member: Member,
  csrf: string | undefined = member.csrfToken,
) => ({
  cookies: { sid: member.token },
  headers: csrf === undefined ? {} : { "x-csrf-token": csrf },
});

const like = (member: Member, tweetId: string, csrf?: string) =>
  app.inject({
    ...signed(member, csrf ?? member.csrfToken),
    method: "PUT",
    url: `/v1/tweets/${tweetId}/like`,
  });

const unlike = (member: Member, tweetId: string) =>
  app.inject({
    ...signed(member),
    method: "DELETE",
    url: `/v1/tweets/${tweetId}/like`,
  });

async function postTweet(member: Member, content: string): Promise<string> {
  const response = await app.inject({
    ...signed(member),
    method: "POST",
    payload: { content },
    url: "/v1/tweets",
  });
  expect(response.statusCode).toBe(201);
  return createTweetResponseSchema.parse(response.json()).tweet.id;
}

async function timelineCard(member: Member, tweetId: string) {
  const response = await app.inject({
    ...signed(member, undefined),
    method: "GET",
    url: "/v1/timeline",
  });
  expect(response.statusCode).toBe(200);
  return timelinePageSchema
    .parse(response.json())
    .items.find((item) => item.id === tweetId);
}

let ada: Member;
let tweetId: string;

beforeEach(async () => {
  await database.reset();
  ada = await registerMember("ada");
  tweetId = await postTweet(ada, "Hello");
});

describe("like API", () => {
  it("US-C02 AC-C02.1 likes once, unlikes idempotently, and the timeline agrees", async () => {
    const first = await like(ada, tweetId);
    const repeat = await like(ada, tweetId);

    expect(first.statusCode).toBe(200);
    expect(likeResponseSchema.parse(first.json())).toEqual({
      like: { likeCount: 1, liked: true },
    });
    expect(likeResponseSchema.parse(repeat.json()).like.likeCount).toBe(1);
    await expect(timelineCard(ada, tweetId)).resolves.toMatchObject({
      likeCount: 1,
      likedByViewer: true,
    });

    const removed = await unlike(ada, tweetId);
    const again = await unlike(ada, tweetId);

    expect(likeResponseSchema.parse(removed.json())).toEqual({
      like: { likeCount: 0, liked: false },
    });
    expect(again.statusCode).toBe(200);
    await expect(timelineCard(ada, tweetId)).resolves.toMatchObject({
      likeCount: 0,
      likedByViewer: false,
    });
  });

  it("US-C02 AC-C02.4 counts concurrent likes from many members exactly", async () => {
    const members = await Promise.all(
      Array.from({ length: 8 }, (_, index) => registerMember(`fan${index}`)),
    );

    const responses = await Promise.all(
      members.map((member) => like(member, tweetId)),
    );

    expect(responses.every((response) => response.statusCode === 200)).toBe(
      true,
    );
    await expect(database.db.$count(likes)).resolves.toBe(members.length);
    await expect(timelineCard(ada, tweetId)).resolves.toMatchObject({
      likeCount: members.length,
      likedByViewer: false,
    });
  });

  it("US-B02 AC-B02.1 deleting a tweet removes its likes and later likes 404", async () => {
    await like(ada, tweetId);

    const deleted = await app.inject({
      ...signed(ada),
      method: "DELETE",
      url: `/v1/tweets/${tweetId}`,
    });
    expect(deleted.statusCode).toBe(204);
    await expect(database.db.$count(likes)).resolves.toBe(0);

    const late = await like(ada, tweetId);
    expect(late.statusCode).toBe(404);
    expect(errorResponseSchema.parse(late.json()).error.code).toBe("NOT_FOUND");
  });

  it("US-A02 AC-A02.5 refuses a like without a session or CSRF token", async () => {
    const anonymous = await app.inject({
      method: "PUT",
      url: `/v1/tweets/${tweetId}/like`,
    });
    const forged = await like(ada, tweetId, "wrong-token");

    expect(anonymous.statusCode).toBe(401);
    expect(forged.statusCode).toBe(403);
    await expect(database.db.$count(likes)).resolves.toBe(0);
  });
});
