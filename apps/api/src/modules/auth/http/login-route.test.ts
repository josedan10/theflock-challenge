import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  authSessionResponseSchema,
  errorResponseSchema,
} from "@twitter-clone/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { registerErrorHandling } from "../../../platform/http/errors.js";
import { InvalidCredentialsError } from "../domain/errors.js";

import { loginRoute } from "./login-route.js";

import type {
  LoggedInMember,
  LogInMemberInput,
} from "../application/log-in-member.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");

const loggedIn: LoggedInMember = {
  credentials: {
    csrfSecretHash: Buffer.alloc(32),
    csrfToken: "c".repeat(43),
    token: "t".repeat(43),
    tokenHash: Buffer.alloc(32),
  },
  session: {
    createdAt: NOW,
    csrfSecretHash: Buffer.alloc(32),
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
    lastSeenAt: NOW,
    revokedAt: null,
    userId: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
  },
  user: {
    avatarKey: null,
    bio: "",
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

let app: FastifyInstance;
let calls: LogInMemberInput[];

async function buildTestApp(
  behavior: () => Promise<LoggedInMember> = async () => loggedIn,
): Promise<FastifyInstance> {
  calls = [];
  app = Fastify({ logger: false });
  registerErrorHandling(app);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(
    (instance) =>
      loginRoute(instance, {
        logInMember: async (input) => {
          calls.push(input);
          return behavior();
        },
        rateLimit: { max: 3, timeWindowMs: 60_000 },
        sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3_600 },
      }),
    { prefix: "/v1" },
  );
  await app.ready();
  return app;
}

afterEach(async () => {
  await app.close();
});

const credentialsBody = {
  email: "ada@example.com",
  password: "correct horse battery",
};
const logIn = (payload: object, cookies: Record<string, string> = {}) =>
  app.inject({ cookies, method: "POST", payload, url: "/v1/auth/login" });

describe("POST /v1/auth/login", () => {
  it("US-A02 AC-A02.1 returns 200 with the session user, CSRF token, and an HTTP-only cookie", async () => {
    await buildTestApp();

    const response = await logIn(credentialsBody);

    expect(response.statusCode).toBe(200);
    expect(authSessionResponseSchema.parse(response.json()).user.username).toBe(
      "ada",
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.cookies[0]).toMatchObject({
      httpOnly: true,
      name: "sid",
      sameSite: "Lax",
      secure: true,
      value: "t".repeat(43),
    });
    expect(response.body).not.toContain("argon2");
  });

  it("US-A02 AC-A02.1 passes the presented session cookie on for rotation", async () => {
    await buildTestApp();

    await logIn(credentialsBody, { sid: "old-session-token" });

    expect(calls[0]?.previousSessionToken).toBe("old-session-token");
  });

  it("US-A02 AC-A02.2 answers bad credentials with a generic 401 and no cookie", async () => {
    await buildTestApp(async () => {
      throw new InvalidCredentialsError();
    });

    const response = await logIn(credentialsBody);

    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.parse(response.json()).error).toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Invalid email or password.",
    });
    expect(response.json().error.fields).toBeUndefined();
    expect(response.cookies).toHaveLength(0);
  });

  it("rejects a malformed login body with 422 without calling the use case", async () => {
    await buildTestApp();

    const response = await logIn({ email: "", password: "" });

    expect(response.statusCode).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it("rate limits repeated login attempts", async () => {
    await buildTestApp(async () => {
      throw new InvalidCredentialsError();
    });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push((await logIn(credentialsBody)).statusCode);
    }

    expect(statuses).toEqual([401, 401, 401, 429]);
  });
});
