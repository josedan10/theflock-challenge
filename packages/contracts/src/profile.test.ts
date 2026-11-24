import { describe, expect, it } from "vitest";

import {
  publicProfileResponseSchema,
  publicProfileSchema,
  updateProfileRequestSchema,
} from "./profile";

const profile = {
  avatarUrl: null,
  bio: "",
  createdAt: "2026-11-24T12:00:00.000Z",
  displayName: "Ada",
  followerCount: 0,
  followingCount: 0,
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
  tweetCount: 0,
  username: "ada_lovelace",
};

describe("profile update contract", () => {
  it("PROFILE-02 trims a display name and bio and allows either field alone", () => {
    expect(
      updateProfileRequestSchema.parse({
        bio: "  Analyst  ",
        displayName: "  Ada Lovelace  ",
      }),
    ).toEqual({ bio: "Analyst", displayName: "Ada Lovelace" });
    expect(updateProfileRequestSchema.parse({ bio: "Analyst" })).toEqual({
      bio: "Analyst",
    });
    expect(updateProfileRequestSchema.parse({ displayName: "Ada" })).toEqual({
      displayName: "Ada",
    });
  });

  it("PROFILE-02 allows an empty bio and a 160-code-point bio", () => {
    expect(updateProfileRequestSchema.parse({ bio: "   " })).toEqual({
      bio: "",
    });
    const bio = "😀".repeat(160);
    expect(updateProfileRequestSchema.parse({ bio }).bio).toBe(bio);
  });

  it("US-A03 AC-A03.3 accepts markup as plain text instead of interpreting it", () => {
    const bio = '<script>alert("xss")</script>';

    expect(updateProfileRequestSchema.parse({ bio }).bio).toBe(bio);
  });

  it("PROFILE-02 rejects an empty patch, oversized text, a null character, and unknown keys", () => {
    expect(updateProfileRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateProfileRequestSchema.safeParse({ bio: "😀".repeat(161) }).success,
    ).toBe(false);
    expect(
      updateProfileRequestSchema.safeParse({ displayName: "   " }).success,
    ).toBe(false);
    expect(
      updateProfileRequestSchema.safeParse({ displayName: "a".repeat(81) })
        .success,
    ).toBe(false);
    expect(
      updateProfileRequestSchema.safeParse({ bio: "bad\u0000bio" }).success,
    ).toBe(false);

    const rejected = updateProfileRequestSchema.safeParse({
      avatarKey: "objects/someone-else",
      bio: "Analyst",
      email: "ada@example.com",
      password: "correct horse battery",
      userId: profile.id,
      username: "stolen",
    });
    expect(rejected.success).toBe(false);
    if (!rejected.success) {
      expect(rejected.error.issues[0]?.message).toContain("avatarKey");
      expect(rejected.error.issues[0]?.message).toContain("email");
      expect(rejected.error.issues[0]?.message).toContain("username");
    }
  });
});

describe("public profile contract", () => {
  it("US-A03 AC-A03.1 accepts the public document and drops secrets", () => {
    expect(publicProfileSchema.parse(profile)).toEqual(profile);
    expect(publicProfileResponseSchema.parse({ profile })).toEqual({
      profile,
    });

    const parsed = publicProfileSchema.parse({
      ...profile,
      avatarKey: "objects/ada",
      email: "ada@example.com",
      passwordHash: "$argon2id$secret",
    });

    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("passwordHash");
    expect(parsed).not.toHaveProperty("avatarKey");
  });

  it("US-A03 AC-A03.1 rejects a negative count and an unnormalized username", () => {
    expect(
      publicProfileSchema.safeParse({ ...profile, followerCount: -1 }).success,
    ).toBe(false);
    expect(
      publicProfileSchema.safeParse({ ...profile, username: "Ada_Lovelace" })
        .success,
    ).toBe(false);
  });
});
