import { AppError } from "../../../platform/http/errors.js";

import { hasValidCsrfToken } from "./authentication.js";
import {
  SESSION_COOKIE_NAME,
  type SessionCookieSettings,
  sessionCookieOptions,
} from "./session-cookie.js";

import type {
  SessionCredentialGenerator,
  SessionRepository,
} from "../application/ports.js";
import type { FastifyInstance } from "fastify";

export interface LogoutRouteDependencies {
  sessions: SessionRepository;
  credentials: SessionCredentialGenerator;
  clock: () => Date;
  sessionCookie: SessionCookieSettings;
}

/**
 * `POST /auth/logout` (AC-A02.3). Revokes the current session and clears the
 * cookie. Idempotent: with no active session there is nothing to protect, so
 * it still answers `204` and clears the cookie. An active session requires
 * the CSRF token, so another site cannot log the member out.
 */
export async function logoutRoute(
  app: FastifyInstance,
  dependencies: LogoutRouteDependencies,
): Promise<void> {
  app.post("/auth/logout", async (request, reply) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    const now = dependencies.clock();
    const active =
      sessionToken === undefined || sessionToken.length === 0
        ? null
        : await dependencies.sessions.findActiveByTokenHash(
            dependencies.credentials.hash(sessionToken),
            now,
          );

    if (active !== null) {
      if (!hasValidCsrfToken(request, dependencies.credentials, active)) {
        throw new AppError("FORBIDDEN", "A valid CSRF token is required.");
      }
      await dependencies.sessions.revoke(active.session.id, now);
    }

    const { maxAge: _maxAge, ...cookieOptions } = sessionCookieOptions(
      dependencies.sessionCookie,
    );
    return reply
      .code(204)
      .header("cache-control", "no-store")
      .clearCookie(SESSION_COOKIE_NAME, cookieOptions)
      .send();
  });
}
