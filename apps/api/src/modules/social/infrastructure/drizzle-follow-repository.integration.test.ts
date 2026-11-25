import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { users } from "../../auth/infrastructure/auth.schema.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";
import { FollowTargetNotFoundError } from "../domain/errors.js";

import { createDrizzleFollowRepository } from "./drizzle-follow-repository.js";
import { follows } from "./social.schema.js";

import type { StoredUser } from "../../auth/application/ports.js";
import type { FollowRepository } from "../application/ports.js";

let database: TestDatabase;
let repository: FollowRepository;
let ada: StoredUser;
let grace: StoredUser;

beforeAll(async () => {
  database = await startTestDatabase();
  repository = createDrizzleFollowRepository(database.db);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
  const members = createDrizzleUserRepository(database.db);
  ada = await members.create(
    buildNewUser({ displayName: "Ada", username: "ada" }),
  );
  grace = await members.create(
    buildNewUser({ displayName: "Grace", username: "grace" }),
  );
});

describe("follow persistence", () => {
  it("US-C01 AC-C01.1 inserts one edge and returns the target's committed count", async () => {
    const relationship = await repository.follow({
      followerId: ada.id,
      now: FIXED_NOW,
      username: "grace",
    });

    expect(relationship).toEqual({
      followerCount: 1,
      following: true,
      targetId: grace.id,
    });
    const [stored] = await database.db.select().from(follows);
    expect(stored).toMatchObject({
      createdAt: FIXED_NOW,
      followerId: ada.id,
      followingId: grace.id,
    });
  });

  it("US-C01 AC-C01.2 keeps a single edge and the original timestamp on a repeat follow", async () => {
    await repository.follow({
      followerId: ada.id,
      now: FIXED_NOW,
      username: "grace",
    });

    const again = await repository.follow({
      followerId: ada.id,
      now: new Date("2026-11-24T13:00:00.000Z"),
      username: "grace",
    });

    expect(again).toMatchObject({ followerCount: 1, following: true });
    const [stored] = await database.db.select().from(follows);
    expect(stored?.createdAt).toEqual(FIXED_NOW);
    await expect(database.db.$count(follows)).resolves.toBe(1);
  });

  it("US-C01 AC-C01.2 stores nothing for a self-follow", async () => {
    await expect(
      repository.follow({
        followerId: ada.id,
        now: FIXED_NOW,
        username: "ada",
      }),
    ).rejects.toThrow("You cannot follow yourself.");
    await expect(database.db.$count(follows)).resolves.toBe(0);
  });

  it("US-C01 AC-C01.1 stores nothing for an unknown or soft-deleted member", async () => {
    await database.db
      .update(users)
      .set({ deletedAt: FIXED_NOW })
      .where(eq(users.id, grace.id));

    await expect(
      repository.follow({
        followerId: ada.id,
        now: FIXED_NOW,
        username: "grace",
      }),
    ).rejects.toThrow("That profile does not exist.");
    await expect(
      repository.follow({
        followerId: ada.id,
        now: FIXED_NOW,
        username: "nobody",
      }),
    ).rejects.toThrow("That profile does not exist.");
    await expect(database.db.$count(follows)).resolves.toBe(0);
  });

  it("maps a missing follower to an absent target without leaking the driver error", async () => {
    await expect(
      repository.follow({
        followerId: uuidv7(),
        now: FIXED_NOW,
        username: "grace",
      }),
    ).rejects.toThrow(FollowTargetNotFoundError);
  });

  it("US-C01 AC-C01.2 keeps one edge when the same follow is committed concurrently", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.follow({
          followerId: ada.id,
          now: FIXED_NOW,
          username: "grace",
        }),
      ),
    );

    expect(results.every((result) => result.followerCount === 1)).toBe(true);
    await expect(database.db.$count(follows)).resolves.toBe(1);
  });

  it("keeps the two directions of an edge independent", async () => {
    await repository.follow({
      followerId: ada.id,
      now: FIXED_NOW,
      username: "grace",
    });

    const reverse = await repository.follow({
      followerId: grace.id,
      now: FIXED_NOW,
      username: "ada",
    });

    expect(reverse.followerCount).toBe(1);
    await expect(database.db.$count(follows)).resolves.toBe(2);
  });

  it("US-C01 AC-C01.2 removes the edge once and reports the remaining count", async () => {
    const other = await createDrizzleUserRepository(database.db).create(
      buildNewUser({ username: "other" }),
    );
    await repository.follow({
      followerId: ada.id,
      now: FIXED_NOW,
      username: "grace",
    });
    await repository.follow({
      followerId: other.id,
      now: FIXED_NOW,
      username: "grace",
    });

    const removed = await repository.unfollow({
      followerId: ada.id,
      username: "grace",
    });
    const again = await repository.unfollow({
      followerId: ada.id,
      username: "grace",
    });

    expect(removed).toEqual({
      followerCount: 1,
      following: false,
      targetId: grace.id,
    });
    expect(again.followerCount).toBe(1);
    await expect(database.db.$count(follows)).resolves.toBe(1);
  });

  it("US-C01 AC-C01.2 concurrent unfollows leave no edge and a zero count", async () => {
    await repository.follow({
      followerId: ada.id,
      now: FIXED_NOW,
      username: "grace",
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.unfollow({ followerId: ada.id, username: "grace" }),
      ),
    );

    expect(results.every((result) => result.followerCount === 0)).toBe(true);
    await expect(database.db.$count(follows)).resolves.toBe(0);
  });
});
