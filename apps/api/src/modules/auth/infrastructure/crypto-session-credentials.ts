import { createHash, createHmac, randomBytes } from "node:crypto";

import type {
  SessionCredentialGenerator,
  SessionCredentials,
} from "../application/ports.js";

/** 256 bits from the CSPRNG; far beyond guessing or birthday-collision range. */
const SECRET_BYTES = 32;

function sha256(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Session tokens are random. CSRF tokens are HMAC-SHA256(key, session token)
 * (OWASP "signed double-submit"): bound to one session, unforgeable without
 * the server key, and re-derivable from the cookie on any request.
 *
 * A plain SHA-256 suffices for storage because the inputs are high-entropy
 * random values, not user-chosen passwords.
 */
export function createCryptoSessionCredentialGenerator(
  csrfKey: string,
): SessionCredentialGenerator {
  const csrfTokenFor = (sessionToken: string): string =>
    createHmac("sha256", csrfKey)
      .update(sessionToken, "utf8")
      .digest("base64url");

  return {
    csrfTokenFor,
    generate(): SessionCredentials {
      const token = randomBytes(SECRET_BYTES).toString("base64url");
      const csrfToken = csrfTokenFor(token);
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
