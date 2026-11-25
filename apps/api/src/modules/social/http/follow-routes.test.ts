import { Writable } from "node:stream";

import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  errorResponseSchema,
  followResponseSchema,
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
import {
  FollowTargetNotFoundError,
  SelfFollowError,
} from "../domain/errors.js";

import { followRoutes } from "./follow-routes.js";

import type { AuthGuard } from "../../auth/http/authentication.js";
import type { FollowMemberInput } from "../application/follow-member.js";
import type { UnfollowMemberInput } from "../application/unfollow-member.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const MEMBER_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";
const TARGET_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61";

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
let followed: FollowMemberInput[];
let unfollowed: UnfollowMemberInput[];

async function buildTestApp(
  options: FastifyServerOptions = { logger: false },
  writeRateLimit: { max: number; timeWindowMs: number } | "default" = {
    max: 100,
    timeWindowMs: 60_000,
  },
) {
  followed = [];
  unfollowed = [];
  app = Fastify(options);
  registerErrorHandling(app);
  app.decorateRequest("auth", null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(
    (instance) =>
      followRoutes(instance, {
        followMember: async (input) => {
          followed.push(input);
          if (input.username === "ada") {
            throw new SelfFollowError();
          }
          if (input.username !== "grace") {
            throw new FollowTargetNotFoundError();
          }
          return {
            followerCount: 1,
            following: true,
            targetId: TARGET_ID,
          };
        },
        requireCsrf,
        requireSession,
        unfollowMember: async (input) => {
          unfollowed.push(input);
          if (input.username === "ada") {
            throw new SelfFollowError();
          }
          if (input.username !== "grace") {
            throw new FollowTargetNotFoundError();
          }
          return {
            followerCount: 0,
            following: false,
            targetId: TARGET_ID,
          };
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

const follow = (
  username: string,
  extras: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    payload?: unknown;
  } = signedIn,
) =>
  app.inject({
    cookies: extras.cookies ?? {},
    headers: extras.headers ?? {},
    method: "PUT",
    ...(extras.payload === undefined
      ? {}
      : { payload: extras.payload as object }),
    url: `/v1/users/${username}/follow`,
  });

const unfollow = (
  username: string,
  extras: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = signedIn,
) =>
  app.inject({
    cookies: extras.cookies ?? {},
    headers: extras.headers ?? {},
    method: "DELETE",
    url: `/v1/users/${username}/follow`,
  });

describe("PUT /v1/users/:username/follow", () => {
  it("US-C01 AC-C01.1 follows as the session member and returns the canonical count", async () => {
    await buildTestApp();

    const response = await follow("grace", {
      ...signedIn,
      payload: { followerId: "someone-else" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(followResponseSchema.parse(response.json())).toEqual({
      relationship: { followerCount: 1, following: true },
    });
    expect(followed).toEqual([{ followerId: MEMBER_ID, username: "grace" }]);
  });

  it("US-C01 AC-C01.2 answers a self-follow with 422 and writes nothing further", async () => {
    await buildTestApp();

    const response = await follow("ada");

    expect(response.statusCode).toBe(422);
    expect(errorResponseSchema.parse(response.json()).error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { username: ["You cannot follow yourself."] },
    });
  });

  it("US-C01 AC-C01.1 answers an unknown member with 404", async () => {
    await buildTestApp();

    const response = await follow("missing");

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "NOT_FOUND",
    );
  });

  it("US-C01 AC-C01.1 answers an unauthenticated follow with 401", async () => {
    await buildTestApp();

    expect((await follow("grace", {})).statusCode).toBe(401);
    expect(followed).toHaveLength(0);
  });

  it("US-A02 AC-A02.5 rejects a follow without the CSRF token", async () => {
    await buildTestApp();

    expect(
      (await follow("grace", { cookies: signedIn.cookies })).statusCode,
    ).toBe(403);
    expect(followed).toHaveLength(0);
  });

  it("logs ids only, never the path username", async () => {
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

    await follow("grace");

    const followedLog = lines
      .map((line) => JSON.parse(line) as { msg?: string; username?: string })
      .find((entry) => entry.msg === "member followed");
    expect(followedLog).toMatchObject({
      followerId: MEMBER_ID,
      followingId: TARGET_ID,
    });
    expect(followedLog).not.toHaveProperty("username");
  });
});

describe("DELETE /v1/users/:username/follow", () => {
  it("US-C01 AC-C01.2 unfollows and returns the canonical count", async () => {
    await buildTestApp();

    const response = await unfollow("grace");

    expect(response.statusCode).toBe(200);
    expect(followResponseSchema.parse(response.json())).toEqual({
      relationship: { followerCount: 0, following: false },
    });
    expect(unfollowed).toEqual([{ followerId: MEMBER_ID, username: "grace" }]);
  });

  it("US-C01 AC-C01.2 answers a self-unfollow with 422", async () => {
    await buildTestApp();

    expect((await unfollow("ada")).statusCode).toBe(422);
  });

  it("US-C01 AC-C01.1 answers an unauthenticated unfollow with 401", async () => {
    await buildTestApp();

    expect((await unfollow("grace", {})).statusCode).toBe(401);
    expect(unfollowed).toHaveLength(0);
  });

  it("US-A02 AC-A02.5 rejects an unfollow without the CSRF token", async () => {
    await buildTestApp();

    expect(
      (await unfollow("grace", { cookies: signedIn.cookies })).statusCode,
    ).toBe(403);
    expect(unfollowed).toHaveLength(0);
  });
});

describe("follow write rate limit", () => {
  it("SOC-01 answers the 61st follow in a minute from one client with 429 by default", async () => {
    await buildTestApp({ logger: false }, "default");

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 61; attempt += 1) {
      statuses.push((await follow("grace")).statusCode);
    }

    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
    expect(followed).toHaveLength(60);
  });

  it("SOC-01 limits unfollows with their own budget of the same size", async () => {
    await buildTestApp({ logger: false }, { max: 2, timeWindowMs: 60_000 });

    expect((await follow("grace")).statusCode).toBe(200);
    expect((await unfollow("grace")).statusCode).toBe(200);
    expect((await unfollow("grace")).statusCode).toBe(200);
    const limited = await unfollow("grace");

    expect(limited.statusCode).toBe(429);
    expect(errorResponseSchema.parse(limited.json()).error.code).toBe(
      "RATE_LIMITED",
    );
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});
