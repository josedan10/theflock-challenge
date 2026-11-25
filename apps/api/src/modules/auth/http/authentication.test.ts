import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { registerErrorHandling } from "../../../platform/http/errors.js";
import { createCryptoSessionCredentialGenerator } from "../infrastructure/crypto-session-credentials.js";

import {
  authContext,
  createOptionalSession,
  createRequireCsrf,
  createRequireSession,
  viewerId,
} from "./authentication.js";

import type { ActiveSession, SessionRepository } from "../application/ports.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const credentials = createCryptoSessionCredentialGenerator(
  "test-secret-with-at-least-32-characters",
);
const issued = credentials.generate();

const active: ActiveSession = {
  session: {
    createdAt: NOW,
    csrfSecretHash: issued.csrfSecretHash,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    id: "session-1",
    lastSeenAt: NOW,
    revokedAt: null,
    userId: "user-1",
  },
  user: {
    avatarKey: null,
    bio: "",
    createdAt: NOW,
    displayName: "Ada",
    email: "ada@example.com",
    emailNormalized: "ada@example.com",
    id: "user-1",
    passwordHash: "$argon2id$hash",
    updatedAt: NOW,
    username: "ada",
  },
};

/** Knows exactly one token; expiry/revocation are covered by repository tests. */
const sessions: SessionRepository = {
  create: async () => active.session,
  findActiveByTokenHash: async (tokenHash, now) => {
    expect(now).toEqual(NOW);
    return tokenHash.equals(issued.tokenHash) ? active : null;
  },
  revoke: async () => true,
};

let app: FastifyInstance;

async function buildTestApp(): Promise<FastifyInstance> {
  app = Fastify({ logger: false });
  registerErrorHandling(app);
  app.decorateRequest("auth", null);
  await app.register(cookie);
  const requireSession = createRequireSession({
    clock: () => NOW,
    credentials,
    sessions,
  });
  app.get("/protected", { preHandler: requireSession }, async (request) => ({
    username: authContext(request).user.username,
  }));
  app.get("/unguarded", async (request) => authContext(request));
  app.get(
    "/public",
    {
      preHandler: createOptionalSession({
        clock: () => NOW,
        credentials,
        sessions,
      }),
    },
    async (request) => ({ viewer: viewerId(request) }),
  );
  app.post(
    "/mutation",
    { preHandler: [requireSession, createRequireCsrf(credentials)] },
    async () => ({ ok: true }),
  );
  await app.ready();
  return app;
}

afterEach(async () => {
  await app.close();
});

describe("requireSession", () => {
  it("US-A02 AC-A02.4 lets an active session through and exposes its member", async () => {
    await buildTestApp();

    const response = await app.inject({
      cookies: { sid: issued.token },
      method: "GET",
      url: "/protected",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ username: "ada" });
  });

  it.each([
    ["no cookie", {}],
    ["an empty cookie", { sid: "" }],
    ["an unknown, expired, or revoked token", { sid: "not-an-active-token" }],
  ])(
    "US-A02 AC-A02.4 answers %s with a generic 401",
    async (_case, cookies) => {
      await buildTestApp();

      const response = await app.inject({
        cookies,
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toMatchObject({
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
      });
    },
  );

  it("fails loudly when a route reads auth without the guard", async () => {
    await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/unguarded" });

    expect(response.statusCode).toBe(500);
  });
});

describe("optionalSession", () => {
  it("US-C03 AC-C03.1 exposes the member of an active session", async () => {
    await buildTestApp();

    const response = await app.inject({
      cookies: { sid: issued.token },
      method: "GET",
      url: "/public",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ viewer: "user-1" });
  });

  it.each([
    ["no cookie", {}],
    ["an empty cookie", { sid: "" }],
    ["an unknown, expired, or revoked token", { sid: "not-an-active-token" }],
  ])("US-C03 AC-C03.1 serves %s as signed out", async (_case, cookies) => {
    await buildTestApp();

    const response = await app.inject({
      cookies,
      method: "GET",
      url: "/public",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ viewer: null });
  });
});

describe("requireCsrf", () => {
  const mutate = (headers: Record<string, string>, sid = issued.token) =>
    app.inject({ cookies: { sid }, headers, method: "POST", url: "/mutation" });

  it("US-A02 AC-A02.5 accepts a mutation carrying the session's CSRF token", async () => {
    await buildTestApp();

    const response = await mutate({ "x-csrf-token": issued.csrfToken });

    expect(response.statusCode).toBe(200);
  });

  it.each([
    ["missing", {}],
    ["empty", { "x-csrf-token": "" }],
    ["wrong", { "x-csrf-token": "forged-token" }],
    ["another session's", { "x-csrf-token": credentials.generate().csrfToken }],
  ])(
    "US-A02 AC-A02.5 rejects a mutation with a %s CSRF token",
    async (_case, headers) => {
      await buildTestApp();

      const response = await mutate(headers);

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toMatchObject({
        code: "FORBIDDEN",
        message: "A valid CSRF token is required.",
      });
    },
  );

  it("US-A02 AC-A02.4 checks the session before the CSRF token", async () => {
    await buildTestApp();

    const response = await mutate(
      { "x-csrf-token": issued.csrfToken },
      "unknown",
    );

    expect(response.statusCode).toBe(401);
  });
});
