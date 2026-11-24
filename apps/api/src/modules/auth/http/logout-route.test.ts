import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerErrorHandling } from "../../../platform/http/errors.js";
import { createCryptoSessionCredentialGenerator } from "../infrastructure/crypto-session-credentials.js";

import { logoutRoute } from "./logout-route.js";

import type { ActiveSession, SessionRepository } from "../application/ports.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const credentials = createCryptoSessionCredentialGenerator(
  "test-secret-with-at-least-32-characters",
);

let issued: ReturnType<typeof credentials.generate>;
let revokedAt: Date | null;
let app: FastifyInstance;

/** One session whose revocation state is observable by the test. */
function inMemorySessions(): SessionRepository {
  return {
    create: async () => {
      throw new Error("not used");
    },
    async findActiveByTokenHash(tokenHash) {
      if (!tokenHash.equals(issued.tokenHash) || revokedAt !== null) {
        return null;
      }
      return {
        session: {
          createdAt: NOW,
          csrfSecretHash: issued.csrfSecretHash,
          expiresAt: new Date(NOW.getTime() + 3_600_000),
          id: "session-1",
          lastSeenAt: NOW,
          revokedAt,
          userId: "user-1",
        },
        user: {} as ActiveSession["user"],
      };
    },
    async revoke(_id, now) {
      if (revokedAt !== null) {
        return false;
      }
      revokedAt = now;
      return true;
    },
  };
}

beforeEach(async () => {
  issued = credentials.generate();
  revokedAt = null;
  app = Fastify({ logger: false });
  registerErrorHandling(app);
  await app.register(cookie);
  await app.register(
    (instance) =>
      logoutRoute(instance, {
        clock: () => NOW,
        credentials,
        sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3_600 },
        sessions: inMemorySessions(),
      }),
    { prefix: "/v1" },
  );
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const logOut = (
  cookies: Record<string, string>,
  headers: Record<string, string> = {},
) => app.inject({ cookies, headers, method: "POST", url: "/v1/auth/logout" });

function expectClearedCookie(response: Awaited<ReturnType<typeof logOut>>) {
  const [cleared] = response.cookies;
  expect(cleared).toMatchObject({
    httpOnly: true,
    name: "sid",
    path: "/",
    value: "",
  });
  expect(cleared?.expires?.getTime()).toBeLessThanOrEqual(Date.now());
}

describe("POST /v1/auth/logout", () => {
  it("US-A02 AC-A02.3 revokes the current session and clears the cookie", async () => {
    const response = await logOut(
      { sid: issued.token },
      { "x-csrf-token": issued.csrfToken },
    );

    expect(response.statusCode).toBe(204);
    expect(revokedAt).toEqual(NOW);
    expectClearedCookie(response);
  });

  it("US-A02 AC-A02.3 is idempotent for an already revoked session", async () => {
    await logOut({ sid: issued.token }, { "x-csrf-token": issued.csrfToken });

    const repeat = await logOut({ sid: issued.token });

    expect(repeat.statusCode).toBe(204);
    expectClearedCookie(repeat);
  });

  it("US-A02 AC-A02.3 answers 204 and clears the cookie without any session", async () => {
    const response = await logOut({});

    expect(response.statusCode).toBe(204);
    expectClearedCookie(response);
  });

  it("US-A02 AC-A02.5 refuses to revoke an active session without the CSRF token", async () => {
    const response = await logOut({ sid: issued.token });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
    expect(revokedAt).toBeNull();
  });
});
