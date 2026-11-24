import {
  type AuthSessionResponse,
  loginRequestSchema,
} from "@twitter-clone/contracts";

import { AppError } from "../../../platform/http/errors.js";
import { InvalidCredentialsError } from "../domain/errors.js";

import { type AuthRateLimit, authRateLimitConfig } from "./rate-limit.js";
import {
  SESSION_COOKIE_NAME,
  type SessionCookieSettings,
  sessionCookieOptions,
} from "./session-cookie.js";
import { toSessionUser } from "./session-user.js";
import { parseBody } from "./validation.js";

import type { LogInMember } from "../application/log-in-member.js";
import type { FastifyInstance } from "fastify";

export interface LoginRouteDependencies {
  logInMember: LogInMember;
  sessionCookie: SessionCookieSettings;
  rateLimit?: AuthRateLimit;
}

/** `POST /auth/login` (US-A02). Mounted under the `/v1` prefix. */
export async function loginRoute(
  app: FastifyInstance,
  dependencies: LoginRouteDependencies,
): Promise<void> {
  app.post(
    "/auth/login",
    { config: { rateLimit: authRateLimitConfig(dependencies.rateLimit) } },
    async (request, reply) => {
      const input = parseBody(loginRequestSchema, request.body);

      let loggedIn;
      try {
        loggedIn = await dependencies.logInMember({
          ...input,
          previousSessionToken: request.cookies[SESSION_COOKIE_NAME],
        });
      } catch (error: unknown) {
        if (error instanceof InvalidCredentialsError) {
          // AC-A02.2: identical response for unknown email and wrong password.
          throw new AppError("UNAUTHENTICATED", "Invalid email or password.");
        }
        throw error;
      }

      const body: AuthSessionResponse = {
        csrfToken: loggedIn.credentials.csrfToken,
        user: toSessionUser(loggedIn.user),
      };
      return reply
        .code(200)
        .header("cache-control", "no-store")
        .setCookie(
          SESSION_COOKIE_NAME,
          loggedIn.credentials.token,
          sessionCookieOptions(dependencies.sessionCookie),
        )
        .send(body);
    },
  );
}
