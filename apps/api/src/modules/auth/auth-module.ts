import { v7 as uuidv7 } from "uuid";

import { createRegisterMember } from "./application/register-member.js";
import {
  type RegistrationRateLimit,
  registerRoute,
} from "./http/register-route.js";
import { createArgon2PasswordHasher } from "./infrastructure/argon2-password-hasher.js";
import { createCryptoSessionCredentialGenerator } from "./infrastructure/crypto-session-credentials.js";
import { createDrizzleAuthUnitOfWork } from "./infrastructure/drizzle-auth-unit-of-work.js";

import type { Database } from "../../platform/database/client.js";
import type { PasswordHasher } from "./application/ports.js";
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
  /** Defaults to 5 attempts per minute per client. */
  registrationRateLimit?: RegistrationRateLimit;
}

/** Composition root for authentication: wires adapters into use cases and routes. */
export function authModule(options: AuthModuleOptions) {
  const registerMember = createRegisterMember({
    clock: options.clock ?? (() => new Date()),
    credentials: createCryptoSessionCredentialGenerator(options.sessionSecret),
    generateId: uuidv7,
    passwordHasher: options.passwordHasher ?? createArgon2PasswordHasher(),
    sessionTtlSeconds: options.sessionCookie.ttlSeconds,
    unitOfWork: createDrizzleAuthUnitOfWork(options.db),
  });

  return async (app: FastifyInstance): Promise<void> => {
    await registerRoute(app, {
      registerMember,
      sessionCookie: options.sessionCookie,
      ...(options.registrationRateLimit === undefined
        ? {}
        : { rateLimit: options.registrationRateLimit }),
    });
  };
}
