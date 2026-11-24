/**
 * Persistence ports for authentication. Callers supply IDs and timestamps so
 * use cases stay deterministic under injected clocks and ID generators.
 */

/** Values required to create a member; identifiers must already be normalized. */
export interface NewUser {
  id: string;
  email: string;
  emailNormalized: string;
  username: string;
  displayName: string;
  /** Argon2id encoded hash; never the raw password. */
  passwordHash: string;
  now: Date;
}

/** Persisted member, including credential material for internal use only. */
export interface StoredUser {
  id: string;
  email: string;
  emailNormalized: string;
  username: string;
  displayName: string;
  bio: string;
  avatarKey: string | null;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRepository {
  /**
   * @throws {IdentityConflictError} When the email or username is taken, including
   * by a concurrent registration that commits first.
   */
  create(user: NewUser): Promise<StoredUser>;
  findByEmailNormalized(emailNormalized: string): Promise<StoredUser | null>;
  findByUsername(username: string): Promise<StoredUser | null>;
}

/** Values required to open a session; hashes are 32-byte SHA-256 digests. */
export interface NewSession {
  id: string;
  userId: string;
  tokenHash: Buffer;
  csrfSecretHash: Buffer;
  now: Date;
  expiresAt: Date;
}

export interface StoredSession {
  id: string;
  userId: string;
  csrfSecretHash: Buffer;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** An unexpired, unrevoked session together with its member. */
export interface ActiveSession {
  session: StoredSession;
  user: StoredUser;
}

export interface SessionRepository {
  create(session: NewSession): Promise<StoredSession>;
  /** Returns `null` for unknown, expired (`expiresAt <= now`), or revoked sessions. */
  findActiveByTokenHash(
    tokenHash: Buffer,
    now: Date,
  ): Promise<ActiveSession | null>;
  /**
   * Idempotently revokes a session. Returns `true` only for the call that
   * revoked it; repeat calls keep the original `revokedAt`.
   */
  revoke(sessionId: string, now: Date): Promise<boolean>;
}

/** Repositories bound to one transaction. */
export interface AuthRepositories {
  users: UserRepository;
  sessions: SessionRepository;
}

export interface AuthUnitOfWork {
  /**
   * Runs `work` in a single database transaction. It commits when `work`
   * resolves and rolls back, rethrowing, when it rejects.
   */
  run<T>(work: (repositories: AuthRepositories) => Promise<T>): Promise<T>;
}

export interface PasswordHasher {
  /** Returns a self-describing Argon2id encoding including salt and parameters. */
  hash(password: string): Promise<string>;
  /** Returns `false` for a wrong password or an unparseable hash; never throws for those. */
  verify(passwordHash: string, password: string): Promise<boolean>;
}

/**
 * Fresh secrets for one session. The raw values go to the client only; the
 * hashes are what `sessions` stores.
 */
export interface SessionCredentials {
  /** Opaque cookie value. */
  token: string;
  tokenHash: Buffer;
  /** Sent back by the client in `X-CSRF-Token` on cookie-authenticated mutations. */
  csrfToken: string;
  csrfSecretHash: Buffer;
}

export interface SessionCredentialGenerator {
  generate(): SessionCredentials;
  /** Digest used to look up a presented cookie or CSRF token. */
  hash(secret: string): Buffer;
  /**
   * Recomputes the CSRF token bound to a session token, so it can be returned
   * again (for example after a page reload) without storing it.
   */
  csrfTokenFor(sessionToken: string): string;
}
