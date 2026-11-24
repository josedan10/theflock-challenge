import { Writable } from "node:stream";

import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  errorResponseSchema,
  publicProfileResponseSchema,
} from "@twitter-clone/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  AppError,
  registerErrorHandling,
} from "../../../platform/http/errors.js";
import { ProfileNotFoundError } from "../domain/errors.js";

import { getProfileRoute } from "./get-profile-route.js";
import { updateProfileRoute } from "./update-profile-route.js";

import type { AuthGuard } from "../../auth/http/authentication.js";
import type { GetPublicProfile } from "../application/get-public-profile.js";
import type { PublicProfile } from "../application/ports.js";
import type {
  UpdateOwnProfile,
  UpdateOwnProfileInput,
} from "../application/update-own-profile.js";

const CREATED_AT = new Date("2026-11-24T12:00:00.000Z");
const SESSION_USER_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";

const ada: PublicProfile = {
  bio: "Analyst",
  createdAt: CREATED_AT,
  displayName: "Ada",
  followerCount: 0,
  followingCount: 0,
  id: SESSION_USER_ID,
  tweetCount: 0,
  username: "ada",
};

const requireSession: AuthGuard = async (request) => {
  if (request.cookies.sid !== "session-token") {
    throw new AppError("UNAUTHENTICATED", "Authentication required.");
  }
  request.auth = {
    session: {
      createdAt: CREATED_AT,
      csrfSecretHash: Buffer.alloc(32),
      expiresAt: new Date(CREATED_AT.getTime() + 3_600_000),
      id: "session-1",
      lastSeenAt: CREATED_AT,
      revokedAt: null,
      userId: SESSION_USER_ID,
    },
    sessionToken: "session-token",
    user: {
      avatarKey: null,
      bio: ada.bio,
      createdAt: CREATED_AT,
      displayName: ada.displayName,
      email: "ada@example.com",
      emailNormalized: "ada@example.com",
      id: SESSION_USER_ID,
      passwordHash: "$argon2id$secret-hash",
      updatedAt: CREATED_AT,
      username: ada.username,
    },
  };
};

const requireCsrf: AuthGuard = async (request) => {
  if (request.headers["x-csrf-token"] !== "csrf-token") {
    throw new AppError("FORBIDDEN", "A valid CSRF token is required.");
  }
};

let app: FastifyInstance;
let lookups: string[];
let updates: UpdateOwnProfileInput[];

async function buildTestApp(
  behavior: {
    getPublicProfile?: GetPublicProfile;
    updateOwnProfile?: UpdateOwnProfile;
  } = {},
  limits: { read: number; write: number } = { read: 20, write: 20 },
  options: ConstructorParameters<typeof Fastify>[0] = { logger: false },
): Promise<FastifyInstance> {
  lookups = [];
  updates = [];
  app = Fastify(options);
  registerErrorHandling(app);
  app.decorateRequest("auth", null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(
    async (instance) => {
      await getProfileRoute(instance, {
        getPublicProfile:
          behavior.getPublicProfile ??
          (async (username) => {
            lookups.push(username);
            if (username === "missing") {
              throw new ProfileNotFoundError();
            }
            return ada;
          }),
        readRateLimit: { max: limits.read, timeWindowMs: 60_000 },
      });
      await updateProfileRoute(instance, {
        requireCsrf,
        requireSession,
        updateOwnProfile:
          behavior.updateOwnProfile ??
          (async (input) => {
            updates.push(input);
            return {
              ...ada,
              ...input.patch,
            };
          }),
        writeRateLimit: { max: limits.write, timeWindowMs: 60_000 },
      });
    },
    { prefix: "/v1" },
  );
  await app.ready();
  return app;
}

afterEach(async () => {
  await app.close();
});

const authed = {
  cookies: { sid: "session-token" },
  headers: { "x-csrf-token": "csrf-token" },
};

describe("profile routes", () => {
  it("US-A03 AC-A03.1 returns the public profile without a session", async () => {
    await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/users/Ada_Lovelace",
    });

    expect(response.statusCode).toBe(200);
    expect(publicProfileResponseSchema.parse(response.json())).toEqual({
      profile: {
        avatarUrl: null,
        bio: "Analyst",
        createdAt: CREATED_AT.toISOString(),
        displayName: "Ada",
        followerCount: 0,
        followingCount: 0,
        id: SESSION_USER_ID,
        tweetCount: 0,
        username: "ada",
      },
    });
    expect(lookups).toEqual(["Ada_Lovelace"]);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.cookies).toHaveLength(0);
    expect(response.body).not.toContain("ada@example.com");
    expect(response.body).not.toContain("argon2");
    expect(response.body).not.toContain("avatarKey");
  });

  it("US-A03 AC-A03.2 answers an unknown username with a real not-found envelope", async () => {
    await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/users/missing",
    });

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.parse(response.json()).error).toMatchObject({
      code: "NOT_FOUND",
      message: "That profile does not exist.",
    });
    expect(response.body).not.toContain("avatarUrl");
  });

  it("US-A03 AC-A03.3 returns a bio containing markup as JSON text", async () => {
    const bio = '<script>alert("xss")</script>';
    await buildTestApp({
      getPublicProfile: async () => ({ ...ada, bio }),
    });

    const response = await app.inject({ method: "GET", url: "/v1/users/ada" });

    expect(response.statusCode).toBe(200);
    expect(response.json().profile.bio).toBe(bio);
    expect(response.body.trimStart().startsWith("<")).toBe(false);
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("US-A03 rate limits profile reads per client address", async () => {
    await buildTestApp({}, { read: 2, write: 5 });

    const statuses = [
      (await app.inject({ method: "GET", url: "/v1/users/ada" })).statusCode,
      (await app.inject({ method: "GET", url: "/v1/users/ada" })).statusCode,
      (await app.inject({ method: "GET", url: "/v1/users/ada" })).statusCode,
    ];
    const otherClient = await app.inject({
      method: "GET",
      remoteAddress: "203.0.113.8",
      url: "/v1/users/ada",
    });

    expect(statuses).toEqual([200, 200, 429]);
    expect(otherClient.statusCode).toBe(200);
    expect(
      Number(
        (await app.inject({ method: "GET", url: "/v1/users/ada" })).headers[
          "retry-after"
        ],
      ),
    ).toBeGreaterThan(0);
  });

  it("PROFILE-02 updates only the session member and does not log the new values", async () => {
    const lines: string[] = [];
    await buildTestApp(
      {},
      { read: 20, write: 20 },
      {
        logger: {
          level: "info",
          stream: new Writable({
            write(chunk, _encoding, callback) {
              lines.push(chunk.toString());
              callback();
            },
          }),
        },
      },
    );

    const response = await app.inject({
      ...authed,
      method: "PATCH",
      payload: { bio: "Unique Bio Value", displayName: "Unique Display Name" },
      url: "/v1/me/profile",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().profile).toMatchObject({
      bio: "Unique Bio Value",
      displayName: "Unique Display Name",
      id: SESSION_USER_ID,
    });
    expect(updates).toEqual([
      {
        patch: { bio: "Unique Bio Value", displayName: "Unique Display Name" },
        userId: SESSION_USER_ID,
      },
    ]);
    const logged = lines.join("\n");
    expect(logged).toContain("profile updated");
    expect(logged).toContain(SESSION_USER_ID);
    expect(logged).not.toContain("Unique Bio Value");
    expect(logged).not.toContain("Unique Display Name");
    expect(logged).not.toContain("ada@example.com");
  });

  it("US-A02 AC-A02.4 rejects an unauthenticated profile update before the use case", async () => {
    await buildTestApp();

    const response = await app.inject({
      method: "PATCH",
      payload: { bio: "Analyst" },
      url: "/v1/me/profile",
    });

    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "UNAUTHENTICATED",
    );
    expect(updates).toHaveLength(0);
  });

  it("US-A02 AC-A02.5 rejects a profile update without a valid CSRF token", async () => {
    await buildTestApp();

    const missing = await app.inject({
      cookies: { sid: "session-token" },
      method: "PATCH",
      payload: { bio: "Analyst" },
      url: "/v1/me/profile",
    });
    const wrong = await app.inject({
      cookies: { sid: "session-token" },
      headers: { "x-csrf-token": "forged" },
      method: "PATCH",
      payload: { bio: "Analyst" },
      url: "/v1/me/profile",
    });

    expect(missing.statusCode).toBe(403);
    expect(wrong.statusCode).toBe(403);
    expect(errorResponseSchema.parse(missing.json()).error.code).toBe(
      "FORBIDDEN",
    );
    expect(updates).toHaveLength(0);
  });

  it("PROFILE-02 rejects identity fields, an avatar key, and an empty patch", async () => {
    await buildTestApp();

    const assigned = await app.inject({
      ...authed,
      method: "PATCH",
      payload: {
        avatarKey: "objects/someone-else",
        bio: "Analyst",
        email: "attacker@example.com",
        username: "stolen",
      },
      url: "/v1/me/profile",
    });
    const empty = await app.inject({
      ...authed,
      method: "PATCH",
      payload: {},
      url: "/v1/me/profile",
    });

    expect(assigned.statusCode).toBe(422);
    expect(assigned.json().error.fields.body.join(" ")).toContain("email");
    expect(assigned.json().error.fields.body.join(" ")).toContain("avatarKey");
    expect(empty.statusCode).toBe(422);
    expect(updates).toHaveLength(0);
  });

  it("PROFILE-02 has no route for editing another member", async () => {
    await buildTestApp();

    const response = await app.inject({
      ...authed,
      method: "PATCH",
      payload: { bio: "Analyst" },
      url: "/v1/users/grace/profile",
    });

    expect(response.statusCode).toBe(404);
    expect(updates).toHaveLength(0);
  });

  it("returns an opaque 500 when the update fails unexpectedly", async () => {
    await buildTestApp({
      updateOwnProfile: async () => {
        throw new Error("db down");
      },
    });

    const response = await app.inject({
      ...authed,
      method: "PATCH",
      payload: { bio: "Analyst" },
      url: "/v1/me/profile",
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("db down");
  });

  it("PROFILE-02 rate limits writes per client, separately from reads", async () => {
    await buildTestApp({}, { read: 1, write: 1 });

    await app.inject({ method: "GET", url: "/v1/users/ada" });
    const first = await app.inject({
      ...authed,
      method: "PATCH",
      payload: { bio: "One" },
      url: "/v1/me/profile",
    });
    const limited = await app.inject({
      ...authed,
      method: "PATCH",
      payload: { bio: "Two" },
      url: "/v1/me/profile",
    });
    const otherClient = await app.inject({
      ...authed,
      method: "PATCH",
      payload: { bio: "Three" },
      remoteAddress: "203.0.113.9",
      url: "/v1/me/profile",
    });

    expect(first.statusCode).toBe(200);
    expect(limited.statusCode).toBe(429);
    expect(errorResponseSchema.parse(limited.json()).error.code).toBe(
      "RATE_LIMITED",
    );
    expect(otherClient.statusCode).toBe(200);
    expect(updates).toHaveLength(2);
  });
});
