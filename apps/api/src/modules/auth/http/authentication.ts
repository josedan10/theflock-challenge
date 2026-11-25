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

async function findSession(
  dependencies: AuthenticationDependencies,
  request: FastifyRequest,
): Promise<AuthContext | null> {
  const sessionToken = request.cookies[SESSION_COOKIE_NAME];
  if (sessionToken === undefined || sessionToken.length === 0) {
    return null;
  }
  const active = await dependencies.sessions.findActiveByTokenHash(
    dependencies.credentials.hash(sessionToken),
    dependencies.clock(),
  );
  return active === null ? null : { ...active, sessionToken };
}

/**
 * Creates the `requireSession` pre-handler. Unknown, expired, and revoked
 * sessions all produce the same `401`, so the response never says why.
 */
export function createRequireSession(
  dependencies: AuthenticationDependencies,
): AuthGuard {
  return async (request) => {
    const auth = await findSession(dependencies, request);
    if (auth === null) {
      throw new AppError("UNAUTHENTICATED", "Authentication required.");
    }
    request.auth = auth;
  };
}

/**
 * Creates the `optionalSession` pre-handler for public reads that can add
 * viewer-specific state. An active session sets `request.auth`; a missing,
 * unknown, expired, or revoked one leaves it `null` and never fails the
 * request. Read it with {@link viewerId}, never `authContext`.
 */
export function createOptionalSession(
  dependencies: AuthenticationDependencies,
): AuthGuard {
  return async (request) => {
    request.auth = await findSession(dependencies, request);
  };
}

/** The signed-in member on an `optionalSession` route, or `null`. */
export function viewerId(request: FastifyRequest): string | null {
  return request.auth?.user.id ?? null;
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
    if (!hasValidCsrfToken(request, credentials, authContext(request))) {
      throw new AppError("FORBIDDEN", "A valid CSRF token is required.");
    }
  };
}

/** Constant-time check of `X-CSRF-Token` against the session's stored hash. */
export function hasValidCsrfToken(
  request: FastifyRequest,
  credentials: SessionCredentialGenerator,
  { session }: ActiveSession,
): boolean {
  const presented = request.headers[CSRF_HEADER_NAME];
  return (
    typeof presented === "string" &&
    presented.length > 0 &&
    timingSafeEqual(credentials.hash(presented), session.csrfSecretHash)
  );
}
