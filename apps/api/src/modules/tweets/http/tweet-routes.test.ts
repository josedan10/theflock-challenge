import { Writable } from "node:stream";

import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  createTweetResponseSchema,
  errorResponseSchema,
} from "@twitter-clone/contracts";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  AppError,
  registerErrorHandling,
} from "../../../platform/http/errors.js";
import { NotTweetAuthorError, TweetNotFoundError } from "../domain/errors.js";

import { tweetRoutes } from "./tweet-routes.js";

import type { AuthGuard } from "../../auth/http/authentication.js";
import type { CreateTweetInput } from "../application/create-tweet.js";
import type { DeleteTweetInput } from "../application/delete-tweet.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const MEMBER_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";
const TWEET_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61";
const OTHERS_TWEET_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f62";

const requireSession: AuthGuard = async (request) => {
  if (request.cookies.sid !== "session-token") {
    throw new AppError("UNAUTHENTICATED", "Authentication required.");
  }
  request.auth = {
    session: {
      createdAt: NOW,
      csrfSecretHash: Buffer.alloc(32),
      expiresAt: new Date(NOW.getTime() + 3_600_000),
      id: "session-1",
      lastSeenAt: NOW,
      revokedAt: null,
      userId: MEMBER_ID,
    },
    sessionToken: "session-token",
    user: {
      avatarKey: null,
      bio: "",
      createdAt: NOW,
      displayName: "Ada",
      email: "ada@example.com",
      emailNormalized: "ada@example.com",
      id: MEMBER_ID,
      passwordHash: "$argon2id$secret-hash",
      updatedAt: NOW,
      username: "ada",
    },
  };
};

const requireCsrf: AuthGuard = async (request) => {
  if (request.headers["x-csrf-token"] !== "csrf-token") {
    throw new AppError("FORBIDDEN", "A valid CSRF token is required.");
  }
};

let app: FastifyInstance;
let created: CreateTweetInput[];
let deleted: DeleteTweetInput[];

async function buildTestApp(
  options: FastifyServerOptions = { logger: false },
  // `default` omits the override, so the route's own default limit applies.
  writeRateLimit: { max: number; timeWindowMs: number } | "default" = {
    max: 100,
    timeWindowMs: 60_000,
  },
) {
  created = [];
  deleted = [];
  app = Fastify(options);
  registerErrorHandling(app);
  app.decorateRequest("auth", null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(
    (instance) =>
      tweetRoutes(instance, {
        createTweet: async (input) => {
          created.push(input);
          return {
            author: {
              avatarKey: null,
              displayName: "Ada",
              id: MEMBER_ID,
              username: "ada",
            },
            content: input.content,
            createdAt: NOW,
            id: TWEET_ID,
            likeCount: 0,
            likedByViewer: false,
            replyCount: 0,
          };
        },
        deleteTweet: async (input) => {
          deleted.push(input);
          if (input.tweetId === OTHERS_TWEET_ID) {
            throw new NotTweetAuthorError();
          }
          if (input.tweetId !== TWEET_ID) {
            throw new TweetNotFoundError();
          }
        },
        requireCsrf,
        requireSession,
        ...(writeRateLimit === "default" ? {} : { writeRateLimit }),
      }),
    { prefix: "/v1" },
  );
  await app.ready();
  return app;
}

afterEach(async () => {
  await app.close();
});

const signedIn = {
  cookies: { sid: "session-token" },
  headers: { "x-csrf-token": "csrf-token" },
};

const post = (payload: unknown, auth: Partial<typeof signedIn> = signedIn) =>
  app.inject({
    ...auth,
    method: "POST",
    payload: payload as object,
    url: "/v1/tweets",
  });

const remove = (id: string, auth: Partial<typeof signedIn> = signedIn) =>
  app.inject({ ...auth, method: "DELETE", url: `/v1/tweets/${id}` });

describe("POST /v1/tweets", () => {
  it("US-B01 AC-B01.1 publishes for the session member and returns the complete card", async () => {
    await buildTestApp();

    const response = await post({ content: "  hello world  " });

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(
      createTweetResponseSchema.parse(response.json()).tweet,
    ).toMatchObject({
      author: { id: MEMBER_ID, username: "ada" },
      content: "hello world",
      createdAt: NOW.toISOString(),
      likeCount: 0,
      likedByViewer: false,
      replyCount: 0,
    });
    expect(created).toEqual([{ authorId: MEMBER_ID, content: "hello world" }]);
    expect(response.body).not.toContain("ada@example.com");
  });

  it.each([
    ["empty", ""],
    ["whitespace-only", "   "],
    ["over 280 characters", "a".repeat(281)],
  ])(
    "US-B01 AC-B01.2 rejects %s content with 422 and stores nothing",
    async (_case, content) => {
      await buildTestApp();

      const response = await post({ content });

      expect(response.statusCode).toBe(422);
      expect(
        errorResponseSchema.parse(response.json()).error.fields,
      ).toHaveProperty("content");
      expect(created).toHaveLength(0);
    },
  );

  it("rejects a body that tries to choose the author", async () => {
    await buildTestApp();

    const response = await post({ authorId: "someone-else", content: "hi" });

    expect(response.statusCode).toBe(422);
    expect(created).toHaveLength(0);
  });

  it("US-B01 AC-B01.3 answers an unauthenticated request with 401", async () => {
    await buildTestApp();

    const response = await post({ content: "hi" }, {});

    expect(response.statusCode).toBe(401);
    expect(created).toHaveLength(0);
  });

  it("US-A02 AC-A02.5 rejects a cookie-authenticated post without the CSRF token", async () => {
    await buildTestApp();

    const response = await post(
      { content: "hi" },
      { cookies: signedIn.cookies },
    );

    expect(response.statusCode).toBe(403);
    expect(created).toHaveLength(0);
  });

  it("logs ids only, never the tweet text", async () => {
    const lines: string[] = [];
    await buildTestApp({
      logger: {
        level: "info",
        stream: new Writable({
          write(chunk, _encoding, callback) {
            lines.push(String(chunk));
            callback();
          },
        }),
      },
    });

    await post({ content: "very personal words" });

    const logged = lines.join("\n");
    expect(logged).toContain("tweet created");
    expect(logged).not.toContain("very personal words");
  });
});

describe("DELETE /v1/tweets/:id", () => {
  it("US-B02 AC-B02.1 deletes the author's tweet with 204", async () => {
    await buildTestApp();

    const response = await remove(TWEET_ID);

    expect(response.statusCode).toBe(204);
    expect(deleted).toEqual([{ memberId: MEMBER_ID, tweetId: TWEET_ID }]);
  });

  it("US-B02 AC-B02.2 answers another member's tweet with 403", async () => {
    await buildTestApp();

    const response = await remove(OTHERS_TWEET_ID);

    expect(response.statusCode).toBe(403);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "FORBIDDEN",
    );
  });

  it("US-B02 AC-B02.2 answers an unknown tweet with 404", async () => {
    await buildTestApp();

    const response = await remove("0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f99");

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "NOT_FOUND",
    );
  });

  it("answers a malformed id with 404 without calling the use case", async () => {
    await buildTestApp();

    const response = await remove("not-a-uuid");

    expect(response.statusCode).toBe(404);
    expect(deleted).toHaveLength(0);
  });

  it("US-B01 AC-B01.3 answers an unauthenticated delete with 401", async () => {
    await buildTestApp();

    expect((await remove(TWEET_ID, {})).statusCode).toBe(401);
    expect(deleted).toHaveLength(0);
  });

  it("US-A02 AC-A02.5 rejects a cookie-authenticated delete without the CSRF token", async () => {
    await buildTestApp();

    expect(
      (await remove(TWEET_ID, { cookies: signedIn.cookies })).statusCode,
    ).toBe(403);
    expect(deleted).toHaveLength(0);
  });
});

describe("tweet write rate limit", () => {
  it("TWT-02 answers the 21st write in a minute from one client with 429 by default", async () => {
    await buildTestApp({ logger: false }, "default");

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt += 1) {
      statuses.push((await post({ content: `post ${attempt}` })).statusCode);
    }

    expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect(created).toHaveLength(20);
  });

  it("TWT-02 limits deletes too, with their own budget of the same size", async () => {
    await buildTestApp({ logger: false }, { max: 2, timeWindowMs: 60_000 });

    expect((await post({ content: "one" })).statusCode).toBe(201);
    expect((await remove(TWEET_ID)).statusCode).toBe(204);
    expect((await remove(TWEET_ID)).statusCode).toBe(204);
    const limited = await remove(TWEET_ID);

    expect(limited.statusCode).toBe(429);
    expect(errorResponseSchema.parse(limited.json()).error.code).toBe(
      "RATE_LIMITED",
    );
  });
});
