import { timingSafeEqual } from "node:crypto";

import { AppError } from "../../../platform/http/errors.js";

import { SESSION_COOKIE_NAME } from "./session-cookie.js";

import type {
  ActiveSession,
  SessionCredentialGenerator,
  SessionRepository,
} from "../application/ports.js";
import type { FastifyReply, FastifyRequest } from "fastify";

/** The authenticated member and session, plus the raw cookie token. */
export interface AuthContext extends ActiveSession {
  sessionToken: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `requireSession`; `null` on routes that do not require it. */
    auth: AuthContext | null;
  }
}

export interface AuthenticationDependencies {
  sessions: SessionRepository;
  credentials: SessionCredentialGenerator;
  clock: () => Date;
}

export type AuthGuard = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;

/**
 * Creates the `requireSession` pre-handler. Unknown, expired, and revoked
 * sessions all produce the same `401`, so the response never says why.
 */
export function createRequireSession(
  dependencies: AuthenticationDependencies,
): AuthGuard {
  return async (request) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    const active =
      sessionToken === undefined || sessionToken.length === 0
        ? null
        : await dependencies.sessions.findActiveByTokenHash(
            dependencies.credentials.hash(sessionToken),
            dependencies.clock(),
          );

    if (active === null || sessionToken === undefined) {
      throw new AppError("UNAUTHENTICATED", "Authentication required.");
    }
    request.auth = { ...active, sessionToken };
  };
}

/** Returns the context set by `requireSession`; a programming error otherwise. */
export function authContext(request: FastifyRequest): AuthContext {
  if (request.auth === null) {
    throw new Error("Route is missing the requireSession pre-handler");
  }
  return request.auth;
}

/** Header carrying the CSRF token on cookie-authenticated mutations. */
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Creates the `requireCsrf` pre-handler for mutations; it must run after
 * `requireSession`. The presented token's hash is compared with the session's
 * stored hash in constant time. A missing or wrong token gets `403`.
 */
export function createRequireCsrf(
  credentials: SessionCredentialGenerator,
): AuthGuard {
  return async (request) => {
    const { session } = authContext(request);
    const presented = request.headers[CSRF_HEADER_NAME];
    const valid =
      typeof presented === "string" &&
      presented.length > 0 &&
      timingSafeEqual(credentials.hash(presented), session.csrfSecretHash);

    if (!valid) {
      throw new AppError("FORBIDDEN", "A valid CSRF token is required.");
    }
  };
}
