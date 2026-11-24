import {
  normalizeEmail,
  normalizeUsername,
  type RegisterRequest,
} from "@twitter-clone/contracts";

import type {
  AuthUnitOfWork,
  PasswordHasher,
  SessionCredentialGenerator,
  SessionCredentials,
  StoredSession,
  StoredUser,
} from "./ports.js";

export interface RegisterMemberDependencies {
  unitOfWork: AuthUnitOfWork;
  passwordHasher: PasswordHasher;
  credentials: SessionCredentialGenerator;
  clock: () => Date;
  generateId: () => string;
  sessionTtlSeconds: number;
}

export interface RegisteredMember {
  user: StoredUser;
  session: StoredSession;
  /** Raw secrets for the response; never persisted or logged. */
  credentials: SessionCredentials;
}

export type RegisterMember = (
  input: RegisterRequest,
) => Promise<RegisteredMember>;

/**
 * Creates a member and their first session atomically (US-A01).
 *
 * The password is hashed before the transaction opens so the slow Argon2id
 * work never holds row locks, and so a duplicate identifier costs the same
 * time as a success.
 *
 * @throws {IdentityConflictError} When the email or username is already taken.
 */
export function createRegisterMember(
  dependencies: RegisterMemberDependencies,
): RegisterMember {
  return async (input) => {
    const passwordHash = await dependencies.passwordHasher.hash(input.password);
    const credentials = dependencies.credentials.generate();
    const now = dependencies.clock();
    const expiresAt = new Date(
      now.getTime() + dependencies.sessionTtlSeconds * 1000,
    );

    const { session, user } = await dependencies.unitOfWork.run(
      async ({ sessions, users }) => {
        const createdUser = await users.create({
          displayName: input.displayName ?? input.username,
          email: input.email,
          emailNormalized: normalizeEmail(input.email),
          id: dependencies.generateId(),
          now,
          passwordHash,
          username: normalizeUsername(input.username),
        });
        const createdSession = await sessions.create({
          csrfSecretHash: credentials.csrfSecretHash,
          expiresAt,
          id: dependencies.generateId(),
          now,
          tokenHash: credentials.tokenHash,
          userId: createdUser.id,
        });
        return { session: createdSession, user: createdUser };
      },
    );

    return { credentials, session, user };
  };
}
