import { Writable } from "node:stream";

import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  errorResponseSchema,
  likeResponseSchema,
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
import { LikeTargetNotFoundError } from "../domain/errors.js";

import { likeRoutes } from "./like-routes.js";

import type { AuthGuard } from "../../auth/http/authentication.js";
import type { LikeTweetInput } from "../application/like-tweet.js";
import type { UnlikeTweetInput } from "../application/unlike-tweet.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const MEMBER_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";
const TWEET_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f70";
const MISSING_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f79";
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

const signedIn = {
  cookies: { sid: "session-token" },
  headers: { "x-csrf-token": "csrf-token" },
};

let app: FastifyInstance;
let liked: LikeTweetInput[];
let unliked: UnlikeTweetInput[];

async function buildTestApp(
  options: FastifyServerOptions = { logger: false },
  writeRateLimit: { max: number; timeWindowMs: number } | "default" = {
    max: 100,
    timeWindowMs: 60_000,
  },
) {
  liked = [];
  unliked = [];
  app = Fastify(options);
  registerErrorHandling(app);
  app.decorateRequest("auth", null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(
    (instance) =>
      likeRoutes(instance, {
        likeTweet: async (input) => {
          liked.push(input);
          if (input.tweetId !== TWEET_ID) {
            throw new LikeTargetNotFoundError();
          }
          return { likeCount: 3, liked: true, tweetId: TWEET_ID };
        },
        requireCsrf,
        requireSession,
        unlikeTweet: async (input) => {
          unliked.push(input);
          if (input.tweetId !== TWEET_ID) {
            throw new LikeTargetNotFoundError();
          }
          return { likeCount: 2, liked: false, tweetId: TWEET_ID };
        },
        ...(writeRateLimit === "default" ? {} : { writeRateLimit }),
      }),
    { prefix: "/v1" },
  );
  await app.ready();
}

afterEach(async () => {
  await app?.close();
});

const send = (
  method: "DELETE" | "PUT",
  tweetId: string,
  extras: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    payload?: unknown;
  } = signedIn,
) =>
  app.inject({
    cookies: extras.cookies ?? {},
    headers: extras.headers ?? {},
    method,
    ...(extras.payload === undefined
      ? {}
      : { payload: extras.payload as object }),
    url: `/v1/tweets/${tweetId}/like`,
  });

describe.each([
  ["PUT", { likeCount: 3, liked: true }],
  ["DELETE", { likeCount: 2, liked: false }],
] as const)("%s /v1/tweets/:id/like", (method, state) => {
  const calls = () => (method === "PUT" ? liked : unliked);

  it("US-C02 AC-C02.1 acts as the session member and returns the canonical state", async () => {
    await buildTestApp();

    const response = await send(method, TWEET_ID, {
      ...signedIn,
      payload: { memberId: "someone-else" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(likeResponseSchema.parse(response.json())).toEqual({ like: state });
    expect(calls()).toEqual([{ memberId: MEMBER_ID, tweetId: TWEET_ID }]);
  });

  it("US-C02 answers an unknown tweet with 404", async () => {
    await buildTestApp();

    const response = await send(method, MISSING_ID);

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.parse(response.json()).error).toMatchObject({
      code: "NOT_FOUND",
      message: "That tweet does not exist.",
    });
  });

  it("US-C02 answers a malformed id with 404 before the use case", async () => {
    await buildTestApp();

    expect((await send(method, "not-a-uuid")).statusCode).toBe(404);
    expect(calls()).toHaveLength(0);
  });

  it("US-C02 answers an unauthenticated request with 401", async () => {
    await buildTestApp();

    expect((await send(method, TWEET_ID, {})).statusCode).toBe(401);
    expect(calls()).toHaveLength(0);
  });

  it("US-A02 AC-A02.5 rejects a request without the CSRF token", async () => {
    await buildTestApp();

    expect(
      (await send(method, TWEET_ID, { cookies: signedIn.cookies })).statusCode,
    ).toBe(403);
    expect(calls()).toHaveLength(0);
  });
});

describe("like route failures", () => {
  it("passes unexpected failures to the error handler as a 500", async () => {
    app = Fastify({ logger: false });
    registerErrorHandling(app);
    app.decorateRequest("auth", null);
    await app.register(cookie);
    await app.register(rateLimit, { global: false });
    const failure = async () => {
      throw new Error("connection reset");
    };
    await app.register(
      (instance) =>
        likeRoutes(instance, {
          likeTweet: failure,
          requireCsrf,
          requireSession,
          unlikeTweet: failure,
        }),
      { prefix: "/v1" },
    );
    await app.ready();

    expect((await send("PUT", TWEET_ID)).statusCode).toBe(500);
    expect((await send("DELETE", TWEET_ID)).statusCode).toBe(500);
  });
});

describe("like logs", () => {
  it("logs ids only", async () => {
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

    await send("PUT", TWEET_ID);
    await send("DELETE", TWEET_ID);

    const entries = lines.map(
      (line) => JSON.parse(line) as Record<string, unknown>,
    );
    for (const msg of ["tweet liked", "tweet unliked"]) {
      expect(entries.find((entry) => entry.msg === msg)).toMatchObject({
        memberId: MEMBER_ID,
        tweetId: TWEET_ID,
      });
    }
  });
});

describe("like write rate limit", () => {
  it("SOC-02 answers the 61st like in a minute from one client with 429 by default", async () => {
    await buildTestApp({ logger: false }, "default");

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 61; attempt += 1) {
      statuses.push((await send("PUT", TWEET_ID)).statusCode);
    }

    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
    expect(liked).toHaveLength(60);
  });

  it("SOC-02 limits unlikes with their own budget of the same size", async () => {
    await buildTestApp({ logger: false }, { max: 2, timeWindowMs: 60_000 });

    expect((await send("PUT", TWEET_ID)).statusCode).toBe(200);
    expect((await send("DELETE", TWEET_ID)).statusCode).toBe(200);
    expect((await send("DELETE", TWEET_ID)).statusCode).toBe(200);
    const limited = await send("DELETE", TWEET_ID);

    expect(limited.statusCode).toBe(429);
    expect(errorResponseSchema.parse(limited.json()).error.code).toBe(
      "RATE_LIMITED",
    );
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});
