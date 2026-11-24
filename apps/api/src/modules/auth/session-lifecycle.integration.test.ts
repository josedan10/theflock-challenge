import {
  authSessionResponseSchema,
  errorResponseSchema,
} from "@twitter-clone/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";

import type { FastifyInstance, LightMyRequestResponse } from "fastify";

const START = new Date("2026-11-24T12:00:00.000Z");
const TTL_SECONDS = 3_600;

let database: TestDatabase;
let app: FastifyInstance;
let now: Date;

beforeAll(async () => {
  database = await startTestDatabase();
  app = await buildApp({
    auth: {
      clock: () => now,
      db: database.db,
      // Rate limiting has its own tests; this suite exercises the session lifecycle.
      rateLimit: { max: 1_000, timeWindowMs: 60_000 },
      sessionCookie: {
        domain: undefined,
        secure: true,
        ttlSeconds: TTL_SECONDS,
      },
      sessionSecret: "test-secret-with-at-least-32-characters",
    },
    corsOrigin: "http://localhost:3000",
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
});

const member = {
  email: "ada@example.com",
  password: "correct horse battery",
  username: "ada",
};

interface Session {
  token: string;
  csrfToken: string;
}

function sessionFrom(response: LightMyRequestResponse): Session {
  const sid = response.cookies.find((cookie) => cookie.name === "sid");
  return {
    csrfToken: authSessionResponseSchema.parse(response.json()).csrfToken,
    token: sid?.value ?? "",
  };
}

const me = (token?: string) =>
  app.inject({
    cookies: token === undefined ? {} : { sid: token },
    method: "GET",
    url: "/v1/me",
  });

const logIn = (payload: object, token?: string) =>
  app.inject({
    cookies: token === undefined ? {} : { sid: token },
    method: "POST",
    payload,
    url: "/v1/auth/login",
  });

const logOut = (session: Session, csrfToken = session.csrfToken) =>
  app.inject({
    cookies: { sid: session.token },
    headers: { "x-csrf-token": csrfToken },
    method: "POST",
    url: "/v1/auth/logout",
  });

let registered: Session;

beforeEach(async () => {
  now = START;
  await database.reset();
  const response = await app.inject({
    method: "POST",
    payload: member,
    url: "/v1/auth/register",
  });
  expect(response.statusCode).toBe(201);
  registered = sessionFrom(response);
});

describe("session lifecycle end to end", () => {
  it("US-A02 AC-A02.1 logs in with valid credentials and the new session works", async () => {
    const response = await logIn({
      email: "ADA@example.com",
      password: member.password,
    });

    expect(response.statusCode).toBe(200);
    const session = sessionFrom(response);
    const current = await me(session.token);
    expect(current.statusCode).toBe(200);
    expect(authSessionResponseSchema.parse(current.json())).toMatchObject({
      csrfToken: session.csrfToken,
      user: { username: "ada" },
    });
  });

  it("US-A02 AC-A02.1 rotates: the session presented at login stops working", async () => {
    const response = await logIn(
      { email: member.email, password: member.password },
      registered.token,
    );

    expect(response.statusCode).toBe(200);
    expect((await me(registered.token)).statusCode).toBe(401);
    expect((await me(sessionFrom(response).token)).statusCode).toBe(200);
  });

  it("US-A02 AC-A02.2 returns the identical 401 for a wrong password and an unknown email", async () => {
    const wrongPassword = await logIn({
      email: member.email,
      password: "wrong password!",
    });
    const unknownEmail = await logIn({
      email: "nobody@example.com",
      password: member.password,
    });

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.statusCode).toBe(401);
      expect(response.cookies).toHaveLength(0);
    }
    const strip = (response: LightMyRequestResponse) => {
      const { requestId: _requestId, ...rest } = errorResponseSchema.parse(
        response.json(),
      ).error;
      return rest;
    };
    expect(strip(wrongPassword)).toEqual(strip(unknownEmail));
  });

  it("US-A02 AC-A02.3 logout revokes the session, clears the cookie, and is idempotent", async () => {
    const first = await logOut(registered);
    const repeat = await logOut(registered);

    expect(first.statusCode).toBe(204);
    expect(first.cookies[0]).toMatchObject({ name: "sid", value: "" });
    expect(repeat.statusCode).toBe(204);
    expect((await me(registered.token)).statusCode).toBe(401);
  });

  it("US-A02 AC-A02.4 rejects an expired session", async () => {
    now = new Date(START.getTime() + TTL_SECONDS * 1000);

    expect((await me(registered.token)).statusCode).toBe(401);
  });

  it("US-A02 AC-A02.4 rejects requests without a session", async () => {
    const response = await me();

    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("US-A02 AC-A02.5 rejects a cookie-authenticated mutation without a valid CSRF token", async () => {
    const response = await logOut(registered, "forged-token");

    expect(response.statusCode).toBe(403);
    expect((await me(registered.token)).statusCode).toBe(200);
  });

  it("US-A02 AC-A02.5 returns the same CSRF token from /me after a reload", async () => {
    const current = await me(registered.token);

    expect(authSessionResponseSchema.parse(current.json()).csrfToken).toBe(
      registered.csrfToken,
    );
  });
});
