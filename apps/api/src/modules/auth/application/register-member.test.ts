import { beforeEach, describe, expect, it } from "vitest";

import { IdentityConflictError } from "../domain/errors.js";

import {
  createRegisterMember,
  type RegisterMember,
} from "./register-member.js";

import type {
  AuthUnitOfWork,
  NewSession,
  NewUser,
  PasswordHasher,
  SessionCredentialGenerator,
  StoredUser,
} from "./ports.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const TTL_SECONDS = 3_600;

let storedUsers: StoredUser[];
let storedSessions: NewSession[];
let registerMember: RegisterMember;

/** In-memory unit of work that discards writes when the work rejects. */
function inMemoryUnitOfWork(): AuthUnitOfWork {
  return {
    async run(work) {
      const pendingUsers: StoredUser[] = [];
      const pendingSessions: NewSession[] = [];
      const result = await work({
        sessions: {
          async create(session) {
            pendingSessions.push(session);
            return {
              createdAt: session.now,
              csrfSecretHash: session.csrfSecretHash,
              expiresAt: session.expiresAt,
              id: session.id,
              lastSeenAt: session.now,
              revokedAt: null,
              userId: session.userId,
            };
          },
          findActiveByTokenHash: async () => null,
          revoke: async () => false,
        },
        users: {
          async create(user: NewUser) {
            const all = [...storedUsers, ...pendingUsers];
            if (
              all.some(
                (existing) => existing.emailNormalized === user.emailNormalized,
              )
            ) {
              throw new IdentityConflictError("email");
            }
            if (all.some((existing) => existing.username === user.username)) {
              throw new IdentityConflictError("username");
            }
            const { now, ...fields } = user;
            const stored = {
              ...fields,
              avatarKey: null,
              bio: "",
              createdAt: now,
              updatedAt: now,
            };
            pendingUsers.push(stored);
            return stored;
          },
          findByEmailNormalized: async () => null,
          findByUsername: async () => null,
        },
      });
      storedUsers.push(...pendingUsers);
      storedSessions.push(...pendingSessions);
      return result;
    },
  };
}

const fakeHasher: PasswordHasher = {
  hash: async (password) => `$argon2id$fake$${password.length}`,
  verify: async () => true,
};

let credentialCount = 0;
const fakeCredentials: SessionCredentialGenerator = {
  generate() {
    credentialCount += 1;
    return {
      csrfSecretHash: Buffer.alloc(32, 2),
      csrfToken: `csrf-${credentialCount}`,
      token: `token-${credentialCount}`,
      tokenHash: Buffer.alloc(32, 1),
    };
  },
  csrfTokenFor: (token) => `csrf-for-${token}`,
  hash: () => Buffer.alloc(32),
};

let idCount = 0;

beforeEach(() => {
  storedUsers = [];
  storedSessions = [];
  registerMember = createRegisterMember({
    clock: () => NOW,
    credentials: fakeCredentials,
    generateId: () => `id-${(idCount += 1)}`,
    passwordHasher: fakeHasher,
    sessionTtlSeconds: TTL_SECONDS,
    unitOfWork: inMemoryUnitOfWork(),
  });
});

const input = {
  email: "Ada@Example.com",
  password: "correct horse battery",
  username: "Ada_Lovelace",
};

describe("register member", () => {
  it("US-A01 AC-A01.1 creates the member and a session together", async () => {
    const registered = await registerMember(input);

    expect(storedUsers).toHaveLength(1);
    expect(storedSessions).toHaveLength(1);
    expect(storedSessions[0]).toMatchObject({
      expiresAt: new Date(NOW.getTime() + TTL_SECONDS * 1000),
      now: NOW,
      userId: registered.user.id,
    });
    expect(registered.credentials.token).toMatch(/^token-/);
  });

  it("US-A01 AC-A01.2 stores normalized identifiers and keeps the entered email", async () => {
    const { user } = await registerMember(input);

    expect(user).toMatchObject({
      email: "Ada@Example.com",
      emailNormalized: "ada@example.com",
      username: "ada_lovelace",
    });
  });

  it("US-A01 AC-A01.1 defaults the display name to the username as entered", async () => {
    expect((await registerMember(input)).user.displayName).toBe("Ada_Lovelace");
    expect(
      (
        await registerMember({
          ...input,
          displayName: "Ada",
          email: "b@x.io",
          username: "other",
        })
      ).user.displayName,
    ).toBe("Ada");
  });

  it("US-A01 AC-A01.4 stores the hasher output, never the raw password", async () => {
    const { user } = await registerMember(input);

    expect(user.passwordHash).toBe("$argon2id$fake$21");
    expect(JSON.stringify(storedUsers)).not.toContain(input.password);
  });

  it("US-A01 AC-A01.2 propagates a conflict and writes nothing", async () => {
    await registerMember(input);

    await expect(
      registerMember({ ...input, username: "someone_else" }),
    ).rejects.toBeInstanceOf(IdentityConflictError);
    expect(storedUsers).toHaveLength(1);
    expect(storedSessions).toHaveLength(1);
  });
});
