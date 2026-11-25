import { v7 as uuidv7 } from "uuid";

import { createLogInMember } from "./application/log-in-member.js";
import { createRegisterMember } from "./application/register-member.js";
import {
  createOptionalSession,
  createRequireCsrf,
  createRequireSession,
} from "./http/authentication.js";
import { loginRoute } from "./http/login-route.js";
import { logoutRoute } from "./http/logout-route.js";
import { meRoute } from "./http/me-route.js";
import { registerRoute } from "./http/register-route.js";
import { createArgon2PasswordHasher } from "./infrastructure/argon2-password-hasher.js";
import { createCryptoSessionCredentialGenerator } from "./infrastructure/crypto-session-credentials.js";
import { createDrizzleAuthUnitOfWork } from "./infrastructure/drizzle-auth-unit-of-work.js";
import { createDrizzleSessionRepository } from "./infrastructure/drizzle-session-repository.js";

import type { Database } from "../../platform/database/client.js";
import type { PasswordHasher } from "./application/ports.js";
import type { AuthGuard } from "./http/authentication.js";
import type { AuthRateLimit } from "./http/rate-limit.js";
import type { SessionCookieSettings } from "./http/session-cookie.js";
import type { FastifyInstance } from "fastify";

export interface AuthModuleOptions {
  db: Database;
  sessionCookie: SessionCookieSettings;
  /** Server key for CSRF token derivation (`SESSION_SECRET`). */
  sessionSecret: string;
  /** Injected for deterministic tests; defaults to the system clock. */
  clock?: () => Date;
  /** Injected to tune Argon2 cost; defaults to the OWASP minimum. */
  passwordHasher?: PasswordHasher;
  /** Register and login budget; defaults to 5 attempts per minute per client. */
  rateLimit?: AuthRateLimit;
}

/** Session guards shared with modules that protect their own routes. */
export interface AuthRuntime {
  plugin: (app: FastifyInstance) => Promise<void>;
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  /** Sets `request.auth` when a session is active; never rejects. */
  optionalSession: AuthGuard;
}

/**
 * Composition root for authentication: wires adapters into use cases, routes,
 * and the guards other modules reuse. One runtime shares one session lookup.
 */
export function createAuthRuntime(options: AuthModuleOptions): AuthRuntime {
  const clock = options.clock ?? (() => new Date());
  const credentials = createCryptoSessionCredentialGenerator(
    options.sessionSecret,
  );
  const sessions = createDrizzleSessionRepository(options.db);
  const useCaseDependencies = {
    clock,
    credentials,
    generateId: uuidv7,
    passwordHasher: options.passwordHasher ?? createArgon2PasswordHasher(),
    sessionTtlSeconds: options.sessionCookie.ttlSeconds,
    unitOfWork: createDrizzleAuthUnitOfWork(options.db),
  };
  const rateLimit =
    options.rateLimit === undefined ? {} : { rateLimit: options.rateLimit };
  const requireSession = createRequireSession({ clock, credentials, sessions });
  const requireCsrf = createRequireCsrf(credentials);
  const optionalSession = createOptionalSession({
    clock,
    credentials,
    sessions,
  });

  return {
    optionalSession,
    requireCsrf,
    requireSession,
    plugin: async (app: FastifyInstance): Promise<void> => {
      app.decorateRequest("auth", null);
      await registerRoute(app, {
        registerMember: createRegisterMember(useCaseDependencies),
        sessionCookie: options.sessionCookie,
        ...rateLimit,
      });
      await loginRoute(app, {
        logInMember: createLogInMember(useCaseDependencies),
        sessionCookie: options.sessionCookie,
        ...rateLimit,
      });
      await logoutRoute(app, {
        clock,
        credentials,
        sessionCookie: options.sessionCookie,
        sessions,
      });
      await meRoute(app, { credentials, requireSession });
    },
  };
}
