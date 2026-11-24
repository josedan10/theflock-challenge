import cookie from "@fastify/cookie";
import { authSessionResponseSchema } from "@twitter-clone/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  registerErrorHandling,
  AppError,
} from "../../../platform/http/errors.js";
import { createCryptoSessionCredentialGenerator } from "../infrastructure/crypto-session-credentials.js";

import { meRoute } from "./me-route.js";

import type { AuthGuard } from "./authentication.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const credentials = createCryptoSessionCredentialGenerator(
  "test-secret-with-at-least-32-characters",
);
const issued = credentials.generate();

/** Stand-in for requireSession; the real guard has its own tests. */
const requireSession: AuthGuard = async (request) => {
  if (request.cookies.sid !== issued.token) {
    throw new AppError("UNAUTHENTICATED", "Authentication required.");
  }
  request.auth = {
    session: {
      createdAt: NOW,
      csrfSecretHash: issued.csrfSecretHash,
      expiresAt: new Date(NOW.getTime() + 3_600_000),
      id: "session-1",
      lastSeenAt: NOW,
      revokedAt: null,
      userId: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
    },
    sessionToken: issued.token,
    user: {
      avatarKey: null,
      bio: "Analyst",
      createdAt: NOW,
      displayName: "Ada",
      email: "ada@example.com",
      emailNormalized: "ada@example.com",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
      passwordHash: "$argon2id$secret-hash",
      updatedAt: NOW,
      username: "ada",
    },
  };
};

let app: FastifyInstance;

async function buildTestApp(): Promise<FastifyInstance> {
  app = Fastify({ logger: false });
  registerErrorHandling(app);
  app.decorateRequest("auth", null);
  await app.register(cookie);
  await app.register(
    (instance) => meRoute(instance, { credentials, requireSession }),
    {
      prefix: "/v1",
    },
  );
  await app.ready();
  return app;
}

afterEach(async () => {
  await app.close();
});

describe("GET /v1/me", () => {
  it("US-A02 AC-A02.4 returns the session-safe member and their CSRF token", async () => {
    await buildTestApp();

    const response = await app.inject({
      cookies: { sid: issued.token },
      method: "GET",
      url: "/v1/me",
    });

    expect(response.statusCode).toBe(200);
    expect(authSessionResponseSchema.parse(response.json())).toEqual({
      csrfToken: issued.csrfToken,
      user: {
        avatarUrl: null,
        bio: "Analyst",
        createdAt: NOW.toISOString(),
        displayName: "Ada",
        id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
        username: "ada",
      },
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).not.toContain("ada@example.com");
    expect(response.body).not.toContain("argon2");
  });

  it("US-A02 AC-A02.4 is protected by the session guard", async () => {
    await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(401);
  });
});
