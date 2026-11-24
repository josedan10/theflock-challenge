import { describe, expect, it } from "vitest";

import { createCryptoSessionCredentialGenerator } from "./crypto-session-credentials.js";

const generator = createCryptoSessionCredentialGenerator();

describe("session credential generator", () => {
  it("US-A02 AC-A02.1 issues URL-safe 256-bit token and CSRF secrets", () => {
    const credentials = generator.generate();

    for (const secret of [credentials.token, credentials.csrfToken]) {
      expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(secret, "base64url")).toHaveLength(32);
    }
    expect(credentials.token).not.toBe(credentials.csrfToken);
  });

  it("US-A02 AC-A02.1 stores only 32-byte digests that match the raw secrets", () => {
    const credentials = generator.generate();

    expect(credentials.tokenHash).toHaveLength(32);
    expect(credentials.csrfSecretHash).toHaveLength(32);
    expect(
      generator.hash(credentials.token).equals(credentials.tokenHash),
    ).toBe(true);
    expect(
      generator.hash(credentials.csrfToken).equals(credentials.csrfSecretHash),
    ).toBe(true);
    expect(credentials.tokenHash.toString("utf8")).not.toContain(
      credentials.token,
    );
  });

  it("issues distinct secrets on every call", () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generator.generate().token),
    );

    expect(tokens.size).toBe(100);
  });

  it("matches the SHA-256 test vector so stored hashes stay portable", () => {
    expect(generator.hash("abc").toString("hex")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
