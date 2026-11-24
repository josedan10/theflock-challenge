import { describe, expect, it } from "vitest";

import { ProfileNotFoundError } from "../domain/errors.js";

import { createUpdateOwnProfile } from "./update-own-profile.js";

import type {
  ProfileRepository,
  ProfileUpdate,
  PublicProfile,
} from "./ports.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const LATER = new Date("2026-11-24T13:00:00.000Z");

const ada: PublicProfile = {
  bio: "",
  createdAt: NOW,
  displayName: "Ada",
  followerCount: 0,
  followingCount: 0,
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
  tweetCount: 0,
  username: "ada",
};

describe("update own profile", () => {
  it("PROFILE-02 writes only the session member and returns the stored profile", async () => {
    const writes: { now: Date; patch: ProfileUpdate; userId: string }[] = [];
    const profiles: ProfileRepository = {
      async findByUsername() {
        return null;
      },
      async update(userId, patch, now) {
        writes.push({ now, patch, userId });
        return {
          ...ada,
          ...patch,
        };
      },
    };

    const updated = await createUpdateOwnProfile({
      clock: () => LATER,
      profiles,
    })({
      patch: { bio: "Analyst" },
      userId: ada.id,
    });

    expect(updated).toMatchObject({ bio: "Analyst", displayName: "Ada" });
    expect(writes).toEqual([
      { now: LATER, patch: { bio: "Analyst" }, userId: ada.id },
    ]);
  });

  it("PROFILE-02 reports a missing or deleted member as not found", async () => {
    const profiles: ProfileRepository = {
      async findByUsername() {
        return null;
      },
      async update() {
        return null;
      },
    };

    await expect(
      createUpdateOwnProfile({ clock: () => LATER, profiles })({
        patch: { displayName: "Ada" },
        userId: ada.id,
      }),
    ).rejects.toBeInstanceOf(ProfileNotFoundError);
  });

  it("PROFILE-02 refuses an empty patch before touching persistence", async () => {
    let called = false;
    const profiles: ProfileRepository = {
      async findByUsername() {
        return null;
      },
      async update() {
        called = true;
        return ada;
      },
    };

    await expect(
      createUpdateOwnProfile({ clock: () => LATER, profiles })({
        patch: {},
        userId: ada.id,
      }),
    ).rejects.toThrow("Profile update requires a display name or bio");
    expect(called).toBe(false);
  });
});
