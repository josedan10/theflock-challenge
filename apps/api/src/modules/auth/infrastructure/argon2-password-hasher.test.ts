import { describe, expect, it } from "vitest";

import { createArgon2PasswordHasher } from "./argon2-password-hasher.js";

const hasher = createArgon2PasswordHasher();
const password = "correct horse battery";

describe("Argon2id password hasher", () => {
  it("US-A01 AC-A01.4 produces an Argon2id hash with the OWASP minimum parameters", async () => {
    const passwordHash = await hasher.hash(password);

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(passwordHash).not.toContain(password);
  });

  it("US-A01 AC-A01.4 salts every hash", async () => {
    expect(await hasher.hash(password)).not.toBe(await hasher.hash(password));
  });

  it("US-A02 AC-A02.1 verifies the matching password only", async () => {
    const passwordHash = await hasher.hash(password);

    await expect(hasher.verify(passwordHash, password)).resolves.toBe(true);
    await expect(hasher.verify(passwordHash, `${password}!`)).resolves.toBe(
      false,
    );
  });

  it("US-A02 AC-A02.2 fails closed for a malformed stored hash", async () => {
    await expect(hasher.verify("not-a-hash", password)).resolves.toBe(false);
  });

  it("US-A01 AC-A01.4 verifies hashes made with older parameters", async () => {
    const legacy = createArgon2PasswordHasher({
      memoryCostKiB: 8_192,
      parallelism: 1,
      timeCost: 1,
    });

    await expect(
      hasher.verify(await legacy.hash(password), password),
    ).resolves.toBe(true);
  });
});
