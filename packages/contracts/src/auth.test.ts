import { describe, expect, it } from "vitest";

import {
  loginRequestSchema,
  normalizeEmail,
  normalizeUsername,
  registerRequestSchema,
  sessionUserSchema,
} from "./auth.js";

const validRegistration = {
  email: "Ada@Example.com",
  username: "Ada_Lovelace",
  password: "correct horse battery",
};

function fieldErrors(input: unknown): Record<string, string[] | undefined> {
  const result = registerRequestSchema.safeParse(input);
  if (result.success) {
    return {};
  }
  return Object.fromEntries(
    result.error.issues.map((issue) => [
      String(issue.path[0]),
      [issue.message],
    ]),
  );
}

describe("registration contract", () => {
  it("US-A01 AC-A01.1 accepts a valid registration and trims identifiers", () => {
    const parsed = registerRequestSchema.parse({
      ...validRegistration,
      email: "  Ada@Example.com ",
      displayName: "  Ada  ",
    });

    expect(parsed).toEqual({
      ...validRegistration,
      displayName: "Ada",
    });
  });

  it("US-A01 AC-A01.1 treats display name as optional", () => {
    expect(registerRequestSchema.parse(validRegistration).displayName).toBe(
      undefined,
    );
  });

  it.each([
    ["too short", "ab"],
    ["starts with a digit", "1ada"],
    ["starts with underscore", "_ada"],
    ["contains a hyphen", "ada-l"],
    ["contains non-ASCII", "adá"],
    ["too long", `a${"b".repeat(30)}`],
  ])("US-A01 AC-A01.3 rejects a username that %s", (_case, username) => {
    expect(fieldErrors({ ...validRegistration, username })).toHaveProperty(
      "username",
    );
  });

  it.each([
    ["3 characters", "abc"],
    ["30 characters", `a${"b".repeat(29)}`],
  ])("US-A01 AC-A01.3 accepts a username with %s", (_case, username) => {
    expect(
      registerRequestSchema.safeParse({ ...validRegistration, username })
        .success,
    ).toBe(true);
  });

  it.each([
    ["missing @", "ada.example.com"],
    ["empty", ""],
    ["over 254 characters", `${"a".repeat(245)}@example.com`],
  ])("US-A01 AC-A01.3 rejects an email that is %s", (_case, email) => {
    expect(fieldErrors({ ...validRegistration, email })).toHaveProperty(
      "email",
    );
  });

  it("US-A01 AC-A01.3 enforces 10–128 password code points", () => {
    expect(
      fieldErrors({ ...validRegistration, password: "a".repeat(9) }),
    ).toHaveProperty("password");
    expect(
      fieldErrors({ ...validRegistration, password: "a".repeat(129) }),
    ).toHaveProperty("password");
    expect(
      registerRequestSchema.safeParse({
        ...validRegistration,
        password: "a".repeat(10),
      }).success,
    ).toBe(true);
    expect(
      registerRequestSchema.safeParse({
        ...validRegistration,
        password: "a".repeat(128),
      }).success,
    ).toBe(true);
  });

  it("US-A01 AC-A01.3 counts emoji as one password character", () => {
    // 10 emoji are 20 UTF-16 units; the policy is defined in characters.
    expect(
      registerRequestSchema.safeParse({
        ...validRegistration,
        password: "🔒".repeat(10),
      }).success,
    ).toBe(true);
    expect(
      fieldErrors({ ...validRegistration, password: "🔒".repeat(9) }),
    ).toHaveProperty("password");
  });

  it("US-A01 AC-A01.4 never trims the password", () => {
    const password = "  spaced secret  ";
    expect(
      registerRequestSchema.parse({ ...validRegistration, password }).password,
    ).toBe(password);
  });

  it("US-A01 AC-A01.3 rejects a blank or over-long display name", () => {
    expect(
      fieldErrors({ ...validRegistration, displayName: "   " }),
    ).toHaveProperty("displayName");
    expect(
      fieldErrors({ ...validRegistration, displayName: "a".repeat(81) }),
    ).toHaveProperty("displayName");
  });
});

describe("identifier normalization", () => {
  it("US-A01 AC-A01.2 maps case variants to the same key", () => {
    expect(normalizeEmail(" Ada@EXAMPLE.com ")).toBe(
      normalizeEmail("ada@example.com"),
    );
    expect(normalizeUsername("Ada_Lovelace")).toBe("ada_lovelace");
  });

  it("US-A01 AC-A01.2 keeps provider-specific address variants distinct", () => {
    expect(normalizeEmail("ada+news@example.com")).not.toBe(
      normalizeEmail("ada@example.com"),
    );
  });
});

describe("login contract", () => {
  it("US-A02 AC-A02.2 does not apply the registration password policy", () => {
    expect(
      loginRequestSchema.safeParse({
        email: "ada@example.com",
        password: "short",
      }).success,
    ).toBe(true);
  });

  it("US-A02 AC-A02.2 bounds oversized credentials before hashing", () => {
    expect(
      loginRequestSchema.safeParse({
        email: "ada@example.com",
        password: "a".repeat(129),
      }).success,
    ).toBe(false);
    expect(
      loginRequestSchema.safeParse({ email: "", password: "x" }).success,
    ).toBe(false);
  });
});

describe("session user contract", () => {
  const user = {
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
    username: "ada_lovelace",
    displayName: "Ada",
    bio: "",
    avatarUrl: null,
    createdAt: "2026-11-24T10:00:00.000Z",
  };

  it("US-A01 AC-A01.1 accepts a session-safe user", () => {
    expect(sessionUserSchema.parse(user)).toEqual(user);
  });

  it("US-A01 AC-A01.1 strips secrets accidentally included in the payload", () => {
    const parsed = sessionUserSchema.parse({
      ...user,
      email: "ada@example.com",
      passwordHash: "$argon2id$...",
    });

    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("passwordHash");
  });

  it("US-A01 AC-A01.1 requires the normalized lowercase username", () => {
    expect(
      sessionUserSchema.safeParse({ ...user, username: "Ada_Lovelace" })
        .success,
    ).toBe(false);
  });
});
