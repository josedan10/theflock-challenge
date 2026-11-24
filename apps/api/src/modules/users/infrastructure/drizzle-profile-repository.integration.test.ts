import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { users } from "../../../platform/database/schema.js";
import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";

import { createDrizzleProfileRepository } from "./drizzle-profile-repository.js";

import type { UserRepository } from "../../auth/application/ports.js";
import type { ProfileRepository } from "../application/ports.js";

const LATER = new Date("2026-11-24T13:00:00.000Z");

let database: TestDatabase;
let profiles: ProfileRepository;
let members: UserRepository;

beforeAll(async () => {
  database = await startTestDatabase();
  profiles = createDrizzleProfileRepository(database.db);
  members = createDrizzleUserRepository(database.db);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
});

describe("profile persistence", () => {
  it("US-A03 AC-A03.1 reads a public profile with zero committed counts", async () => {
    const created = await members.create(
      buildNewUser({ displayName: "Ada", username: "ada" }),
    );

    const profile = await profiles.findByUsername("ada");

    expect(profile).toEqual({
      bio: "",
      createdAt: FIXED_NOW,
      displayName: "Ada",
      followerCount: 0,
      followingCount: 0,
      id: created.id,
      tweetCount: 0,
      username: "ada",
    });
    expect(profile).not.toHaveProperty("email");
    expect(profile).not.toHaveProperty("passwordHash");
    expect(profile).not.toHaveProperty("avatarKey");
  });

  it("US-A03 AC-A03.2 returns null for an unknown, mismatched, or deleted member", async () => {
    const created = await members.create(buildNewUser({ username: "ada" }));
    await database.db
      .update(users)
      .set({ deletedAt: FIXED_NOW })
      .where(eq(users.id, created.id));

    await expect(profiles.findByUsername("ada")).resolves.toBeNull();
    await expect(profiles.findByUsername("nobody")).resolves.toBeNull();
    await expect(profiles.findByUsername("ada' OR '1'='1")).resolves.toBeNull();
  });

  it("PROFILE-02 updates only the requested fields of one member", async () => {
    const ada = await members.create(
      buildNewUser({ displayName: "Ada", username: "ada" }),
    );
    const grace = await members.create(
      buildNewUser({ displayName: "Grace", username: "grace" }),
    );

    const renamed = await profiles.update(
      ada.id,
      { displayName: "Ada Lovelace" },
      LATER,
    );
    const described = await profiles.update(
      ada.id,
      { bio: "Analyst" },
      new Date(LATER.getTime() + 1000),
    );

    expect(renamed).toMatchObject({
      bio: "",
      displayName: "Ada Lovelace",
      username: "ada",
    });
    expect(described).toMatchObject({
      bio: "Analyst",
      displayName: "Ada Lovelace",
    });
    await expect(profiles.findByUsername("grace")).resolves.toMatchObject({
      bio: "",
      displayName: "Grace",
      id: grace.id,
    });

    const [stored] = await database.db
      .select()
      .from(users)
      .where(eq(users.id, ada.id));
    expect(stored).toMatchObject({
      createdAt: FIXED_NOW,
      email: ada.email,
      passwordHash: ada.passwordHash,
      updatedAt: new Date(LATER.getTime() + 1000),
      username: "ada",
    });
  });

  it("PROFILE-02 keeps both fields when two updates commit concurrently", async () => {
    const ada = await members.create(buildNewUser({ username: "ada" }));

    await Promise.all([
      profiles.update(ada.id, { displayName: "Ada Lovelace" }, LATER),
      profiles.update(ada.id, { bio: "Analyst" }, LATER),
    ]);

    await expect(profiles.findByUsername("ada")).resolves.toMatchObject({
      bio: "Analyst",
      displayName: "Ada Lovelace",
    });
  });

  it("US-A03 AC-A03.3 stores a 160-character bio, including markup, unchanged", async () => {
    const ada = await members.create(buildNewUser({ username: "ada" }));
    const markup = "<script>alert(1)</script>";
    const bio = `${markup}${"😀".repeat(160 - [...markup].length)}`;

    const updated = await profiles.update(ada.id, { bio }, LATER);

    expect([...bio].length).toBe(160);
    expect(updated?.bio).toBe(bio);
  });

  it("rejects a bio or display name the table constraints forbid", async () => {
    const ada = await members.create(
      buildNewUser({ displayName: "Ada", username: "ada" }),
    );

    await expect(
      profiles.update(ada.id, { bio: "a".repeat(161) }, LATER),
    ).rejects.toThrow();
    await expect(
      profiles.update(ada.id, { displayName: "   " }, LATER),
    ).rejects.toThrow();
    await expect(profiles.findByUsername("ada")).resolves.toMatchObject({
      bio: "",
      displayName: "Ada",
    });
  });

  it("PROFILE-02 returns null when the member is missing or soft-deleted", async () => {
    const ada = await members.create(buildNewUser({ username: "ada" }));
    await database.db
      .update(users)
      .set({ deletedAt: FIXED_NOW })
      .where(eq(users.id, ada.id));

    await expect(
      profiles.update(ada.id, { bio: "Analyst" }, LATER),
    ).resolves.toBeNull();
    await expect(
      profiles.update(
        "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
        { bio: "x" },
        LATER,
      ),
    ).resolves.toBeNull();
    const [stored] = await database.db
      .select({ bio: users.bio })
      .from(users)
      .where(eq(users.id, ada.id));
    expect(stored?.bio).toBe("");
  });
});
