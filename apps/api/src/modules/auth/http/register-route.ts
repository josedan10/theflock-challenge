import {
  type AuthSessionResponse,
  registerRequestSchema,
} from "@twitter-clone/contracts";

import { AppError } from "../../../platform/http/errors.js";
import { IdentityConflictError } from "../domain/errors.js";

import { type AuthRateLimit, authRateLimitConfig } from "./rate-limit.js";
import {
  SESSION_COOKIE_NAME,
  type SessionCookieSettings,
  sessionCookieOptions,
} from "./session-cookie.js";
import { toSessionUser } from "./session-user.js";
import { parseBody } from "./validation.js";

import type { RegisterMember } from "../application/register-member.js";
import type { FastifyInstance } from "fastify";

export interface RegisterRouteDependencies {
  registerMember: RegisterMember;
  sessionCookie: SessionCookieSettings;
  rateLimit?: AuthRateLimit;
}

/** `POST /auth/register` (US-A01). Mounted under the `/v1` prefix. */
export async function registerRoute(
  app: FastifyInstance,
  dependencies: RegisterRouteDependencies,
): Promise<void> {
  app.post(
    "/auth/register",
    {
      // AC-A01.5: limited before validation, so 429s reveal nothing.
      config: { rateLimit: authRateLimitConfig(dependencies.rateLimit) },
    },
    async (request, reply) => {
      const input = parseBody(registerRequestSchema, request.body);

      let registered;
      try {
        registered = await dependencies.registerMember(input);
      } catch (error: unknown) {
        if (error instanceof IdentityConflictError) {
          throw new AppError("CONFLICT", "Some fields are already in use.", {
            [error.field]: ["Is already in use."],
          });
        }
        throw error;
      }

      const body: AuthSessionResponse = {
        csrfToken: registered.credentials.csrfToken,
        user: toSessionUser(registered.user),
      };
      return reply
        .code(201)
        .header("cache-control", "no-store")
        .setCookie(
          SESSION_COOKIE_NAME,
          registered.credentials.token,
          sessionCookieOptions(dependencies.sessionCookie),
        )
        .send(body);
    },
  );
}
