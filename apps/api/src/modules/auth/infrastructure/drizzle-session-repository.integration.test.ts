import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildNewSession,
  buildNewUser,
  FIXED_NOW,
  randomDigest,
} from "../../../tests/auth-factories.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";

import { sessions, users } from "./auth.schema.js";
import { createDrizzleSessionRepository } from "./drizzle-session-repository.js";
import { createDrizzleUserRepository } from "./drizzle-user-repository.js";

import type {
  SessionRepository,
  StoredUser,
  UserRepository,
} from "../application/ports.js";

let database: TestDatabase;
let userRepository: UserRepository;
let sessionRepository: SessionRepository;
let member: StoredUser;

const ONE_HOUR_MS = 60 * 60 * 1000;
const later = (ms: number) => new Date(FIXED_NOW.getTime() + ms);

beforeAll(async () => {
  database = await startTestDatabase();
  userRepository = createDrizzleUserRepository(database.db);
  sessionRepository = createDrizzleSessionRepository(database.db);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
  member = await userRepository.create(buildNewUser());
});

describe("session persistence", () => {
  it("US-A02 AC-A02.1 stores a session and finds it by token hash with its member", async () => {
    const input = buildNewSession(member.id);

    const created = await sessionRepository.create(input);
    const active = await sessionRepository.findActiveByTokenHash(
      input.tokenHash,
      FIXED_NOW,
    );

    expect(created).toEqual({
      id: input.id,
      userId: member.id,
      csrfSecretHash: input.csrfSecretHash,
      createdAt: FIXED_NOW,
      lastSeenAt: FIXED_NOW,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
    expect(active).toEqual({ session: created, user: member });
  });

  it("US-A02 AC-A02.1 never stores the raw token, only its 32-byte digest", async () => {
    await expect(
      sessionRepository.create(
        buildNewSession(member.id, {
          tokenHash: Buffer.from("raw-cookie-token"),
        }),
      ),
    ).rejects.toThrow();
    await expect(
      sessionRepository.create(
        buildNewSession(member.id, { csrfSecretHash: Buffer.alloc(16) }),
      ),
    ).rejects.toThrow();
  });

  it("returns null for an unknown token hash", async () => {
    await sessionRepository.create(buildNewSession(member.id));

    await expect(
      sessionRepository.findActiveByTokenHash(randomDigest(), FIXED_NOW),
    ).resolves.toBeNull();
  });

  it("US-A02 AC-A02.4 treats a session as expired at and after its expiry instant", async () => {
    const input = buildNewSession(member.id, { expiresAt: later(ONE_HOUR_MS) });
    await sessionRepository.create(input);

    await expect(
      sessionRepository.findActiveByTokenHash(
        input.tokenHash,
        later(ONE_HOUR_MS - 1),
      ),
    ).resolves.not.toBeNull();
    await expect(
      sessionRepository.findActiveByTokenHash(
        input.tokenHash,
        later(ONE_HOUR_MS),
      ),
    ).resolves.toBeNull();
    await expect(
      sessionRepository.findActiveByTokenHash(
        input.tokenHash,
        later(2 * ONE_HOUR_MS),
      ),
    ).resolves.toBeNull();
  });

  it("US-A02 AC-A02.3 revokes idempotently and keeps the first revocation time", async () => {
    const input = buildNewSession(member.id);
    const { id } = await sessionRepository.create(input);

    await expect(sessionRepository.revoke(id, later(1_000))).resolves.toBe(
      true,
    );
    await expect(sessionRepository.revoke(id, later(2_000))).resolves.toBe(
      false,
    );

    const [row] = await database.db
      .select({ revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.id, id));
    expect(row?.revokedAt).toEqual(later(1_000));
  });

  it("US-A02 AC-A02.4 rejects a revoked session even before it expires", async () => {
    const input = buildNewSession(member.id);
    const { id } = await sessionRepository.create(input);
    await sessionRepository.revoke(id, FIXED_NOW);

    await expect(
      sessionRepository.findActiveByTokenHash(input.tokenHash, FIXED_NOW),
    ).resolves.toBeNull();
  });

  it("US-A02 AC-A02.3 revoking one session leaves the member's other sessions active", async () => {
    const first = buildNewSession(member.id);
    const second = buildNewSession(member.id);
    const { id } = await sessionRepository.create(first);
    await sessionRepository.create(second);

    await sessionRepository.revoke(id, FIXED_NOW);

    await expect(
      sessionRepository.findActiveByTokenHash(second.tokenHash, FIXED_NOW),
    ).resolves.not.toBeNull();
  });

  it("returns false when revoking an unknown session", async () => {
    await expect(
      sessionRepository.revoke(buildNewSession(member.id).id, FIXED_NOW),
    ).resolves.toBe(false);
  });

  it("US-A02 AC-A02.4 rejects sessions of a soft-deleted member", async () => {
    const input = buildNewSession(member.id);
    await sessionRepository.create(input);
    await database.db
      .update(users)
      .set({ deletedAt: FIXED_NOW })
      .where(eq(users.id, member.id));

    await expect(
      sessionRepository.findActiveByTokenHash(input.tokenHash, FIXED_NOW),
    ).resolves.toBeNull();
  });

  it("rejects a duplicate token hash", async () => {
    const tokenHash = randomDigest();
    await sessionRepository.create(buildNewSession(member.id, { tokenHash }));

    await expect(
      sessionRepository.create(buildNewSession(member.id, { tokenHash })),
    ).rejects.toThrow();
  });

  it("rejects a session that expires before it is created", async () => {
    await expect(
      sessionRepository.create(
        buildNewSession(member.id, { expiresAt: FIXED_NOW }),
      ),
    ).rejects.toThrow();
  });

  it("rejects a session for an unknown member", async () => {
    await expect(
      sessionRepository.create(buildNewSession(buildNewUser().id)),
    ).rejects.toThrow();
  });

  it("cascades session deletion when the member row is deleted", async () => {
    await sessionRepository.create(buildNewSession(member.id));

    await database.db.delete(users).where(eq(users.id, member.id));

    await expect(database.db.$count(sessions)).resolves.toBe(0);
  });
});
