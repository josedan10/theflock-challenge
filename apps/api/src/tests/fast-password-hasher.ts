import { createArgon2PasswordHasher } from "../modules/auth/infrastructure/argon2-password-hasher.js";

/**
 * Low-cost Argon2id for end-to-end suites that register many members.
 * Production parameters are verified once in argon2-password-hasher.test.ts;
 * paying them on every registration made suites time out on loaded machines.
 */
export const fastPasswordHasher = createArgon2PasswordHasher({
  memoryCostKiB: 1_024,
  parallelism: 1,
  timeCost: 1,
});
