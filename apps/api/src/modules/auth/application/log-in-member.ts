import { type LoginRequest, normalizeEmail } from "@twitter-clone/contracts";

import { InvalidCredentialsError } from "../domain/errors.js";

import type {
  AuthUnitOfWork,
  PasswordHasher,
  SessionCredentialGenerator,
  SessionCredentials,
  StoredSession,
  StoredUser,
} from "./ports.js";

export interface LogInMemberDependencies {
  unitOfWork: AuthUnitOfWork;
  passwordHasher: PasswordHasher;
  credentials: SessionCredentialGenerator;
  clock: () => Date;
  generateId: () => string;
  sessionTtlSeconds: number;
}

export interface LogInMemberInput extends LoginRequest {
  /** Raw token of a session cookie sent with the login request, if any. */
  previousSessionToken?: string | undefined;
}

export interface LoggedInMember {
  user: StoredUser;
  session: StoredSession;
  /** Raw secrets for the response; never persisted or logged. */
  credentials: SessionCredentials;
}

export type LogInMember = (input: LogInMemberInput) => Promise<LoggedInMember>;

/**
 * Verifies credentials and opens a new session (US-A02).
 *
 * An unknown email is still checked against a dummy hash so both failure
 * cases cost the same Argon2id work. A session cookie presented with the
 * login is revoked, so login always rotates to a fresh session.
 *
 * @throws {InvalidCredentialsError} For an unknown email or a wrong password.
 */
export function createLogInMember(
  dependencies: LogInMemberDependencies,
): LogInMember {
  let dummyHash: Promise<string> | undefined;
  const dummyPasswordHash = () =>
    (dummyHash ??= dependencies.passwordHasher.hash(
      "dummy password for timing",
    ));

  return async (input) => {
    const now = dependencies.clock();
    const user = await dependencies.unitOfWork.run(({ users }) =>
      users.findByEmailNormalized(normalizeEmail(input.email)),
    );
    const passwordMatches = await dependencies.passwordHasher.verify(
      user?.passwordHash ?? (await dummyPasswordHash()),
      input.password,
    );
    if (user === null || !passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const credentials = dependencies.credentials.generate();
    const session = await dependencies.unitOfWork.run(async ({ sessions }) => {
      if (input.previousSessionToken !== undefined) {
        const previous = await sessions.findActiveByTokenHash(
          dependencies.credentials.hash(input.previousSessionToken),
          now,
        );
        if (previous !== null) {
          await sessions.revoke(previous.session.id, now);
        }
      }
      return sessions.create({
        csrfSecretHash: credentials.csrfSecretHash,
        expiresAt: new Date(
          now.getTime() + dependencies.sessionTtlSeconds * 1000,
        ),
        id: dependencies.generateId(),
        now,
        tokenHash: credentials.tokenHash,
        userId: user.id,
      });
    });

    return { credentials, session, user };
  };
}
