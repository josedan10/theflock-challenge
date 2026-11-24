import argon2 from "argon2";

import type { PasswordHasher } from "../application/ports.js";

/** Argon2id cost parameters; the encoded hash records them for later verification. */
export interface Argon2Parameters {
  memoryCostKiB: number;
  timeCost: number;
  parallelism: number;
}

/**
 * OWASP Password Storage Cheat Sheet minimum for Argon2id (19 MiB, t=2, p=1).
 * Calibrate upward on production hardware; existing hashes keep verifying.
 */
export const OWASP_MINIMUM_ARGON2ID: Argon2Parameters = {
  memoryCostKiB: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function createArgon2PasswordHasher(
  parameters: Argon2Parameters = OWASP_MINIMUM_ARGON2ID,
): PasswordHasher {
  return {
    hash: (password) =>
      argon2.hash(password, {
        memoryCost: parameters.memoryCostKiB,
        parallelism: parameters.parallelism,
        timeCost: parameters.timeCost,
        type: argon2.argon2id,
      }),

    async verify(passwordHash, password) {
      try {
        return await argon2.verify(passwordHash, password);
      } catch {
        // A malformed stored hash must fail closed, not surface as a 500.
        return false;
      }
    },
  };
}
