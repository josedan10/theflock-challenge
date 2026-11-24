import { createHash, randomBytes } from "node:crypto";

import { v7 as uuidv7 } from "uuid";

import type { NewSession, NewUser } from "../modules/auth/application/ports.js";

/** Fixed instant so ordering and expiry assertions are deterministic. */
export const FIXED_NOW = new Date("2026-11-24T12:00:00.000Z");

/** Syntactically valid Argon2id encoding; persistence tests never verify it. */
const FAKE_ARGON2ID_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$ZmFrZWhhc2hmb3J0ZXN0cw";

let sequence = 0;

/** Minimum valid user with unique identifiers; override only what a test needs. */
export function buildNewUser(overrides: Partial<NewUser> = {}): NewUser {
  sequence += 1;
  const email = `member${sequence}@example.com`;
  return {
    id: uuidv7(),
    email,
    emailNormalized: email,
    username: `member${sequence}`,
    displayName: `Member ${sequence}`,
    passwordHash: FAKE_ARGON2ID_HASH,
    now: FIXED_NOW,
    ...overrides,
  };
}

/** SHA-256 digest of fresh random bytes, mirroring how tokens will be stored. */
export function randomDigest(): Buffer {
  return createHash("sha256").update(randomBytes(32)).digest();
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function buildNewSession(
  userId: string,
  overrides: Partial<NewSession> = {},
): NewSession {
  const now = overrides.now ?? FIXED_NOW;
  return {
    id: uuidv7(),
    userId,
    tokenHash: randomDigest(),
    csrfSecretHash: randomDigest(),
    now,
    expiresAt: new Date(now.getTime() + SEVEN_DAYS_MS),
    ...overrides,
  };
}
