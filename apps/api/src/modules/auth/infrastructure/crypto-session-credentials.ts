import { createHash, randomBytes } from "node:crypto";

import type {
  SessionCredentialGenerator,
  SessionCredentials,
} from "../application/ports.js";

/** 256 bits from the CSPRNG; far beyond guessing or birthday-collision range. */
const SECRET_BYTES = 32;

function randomSecret(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

function sha256(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/**
 * A plain SHA-256 (no salt or slow hash) is sufficient because the inputs are
 * high-entropy random values, not user-chosen passwords.
 */
export function createCryptoSessionCredentialGenerator(): SessionCredentialGenerator {
  return {
    generate(): SessionCredentials {
      const token = randomSecret();
      const csrfToken = randomSecret();
      return {
        csrfSecretHash: sha256(csrfToken),
        csrfToken,
        token,
        tokenHash: sha256(token),
      };
    },
    hash: sha256,
  };
}
