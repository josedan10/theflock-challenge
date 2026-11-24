import { describe, expect, it } from "vitest";

import { ProfileNotFoundError } from "../domain/errors.js";

import { createGetPublicProfile } from "./get-public-profile.js";

import type { ProfileRepository, PublicProfile } from "./ports.js";

const CREATED_AT = new Date("2026-11-24T12:00:00.000Z");

const ada: PublicProfile = {
  bio: "Analyst",
  createdAt: CREATED_AT,
  displayName: "Ada",
  followerCount: 0,
  followingCount: 0,
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
  tweetCount: 0,
  username: "ada_lovelace",
};

describe("get public profile", () => {
  it("US-A03 AC-A03.1 returns the profile for a normalized username", async () => {
    const lookedUp: string[] = [];
    const profiles: ProfileRepository = {
      async findByUsername(username) {
        lookedUp.push(username);
        return username === ada.username ? ada : null;
      },
      async update() {
        throw new Error("A read must not write");
      },
    };

    const profile = await createGetPublicProfile(profiles)("  Ada_Lovelace ");

    expect(profile).toBe(ada);
    expect(lookedUp).toEqual(["ada_lovelace"]);
  });

  it("US-A03 AC-A03.2 does not query when the username cannot exist", async () => {
    let called = false;
    const profiles: ProfileRepository = {
      async findByUsername() {
        called = true;
        return null;
      },
      async update() {
        return null;
      },
    };

    await expect(
      createGetPublicProfile(profiles)("ada' OR '1'='1"),
    ).rejects.toBeInstanceOf(ProfileNotFoundError);
    expect(called).toBe(false);
  });

  it("US-A03 AC-A03.2 fails the same way when no visible member exists", async () => {
    const profiles: ProfileRepository = {
      async findByUsername() {
        return null;
      },
      async update() {
        return null;
      },
    };

    await expect(
      createGetPublicProfile(profiles)("grace"),
    ).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});
