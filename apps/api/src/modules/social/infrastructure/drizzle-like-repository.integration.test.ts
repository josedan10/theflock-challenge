import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";
import { tweets } from "../../tweets/infrastructure/tweets.schema.js";
import { LikeTargetNotFoundError } from "../domain/errors.js";

import { createDrizzleLikeRepository } from "./drizzle-like-repository.js";
import { likes } from "./social.schema.js";

import type { StoredUser } from "../../auth/application/ports.js";
import type { LikeRepository } from "../application/ports.js";

let database: TestDatabase;
let repository: LikeRepository;
let ada: StoredUser;
let grace: StoredUser;
let tweetId: string;

beforeAll(async () => {
  database = await startTestDatabase();
  repository = createDrizzleLikeRepository(database.db);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
  const members = createDrizzleUserRepository(database.db);
  ada = await members.create(buildNewUser({ username: "ada" }));
  grace = await members.create(buildNewUser({ username: "grace" }));
  tweetId = uuidv7();
  await database.db.insert(tweets).values({
    authorId: grace.id,
    content: "Hello",
    createdAt: FIXED_NOW,
    id: tweetId,
  });
});

async function manyMembers(count: number): Promise<StoredUser[]> {
  const members = createDrizzleUserRepository(database.db);
  return Promise.all(
    Array.from({ length: count }, () => members.create(buildNewUser())),
  );
}

describe("like persistence", () => {
  it("US-C02 AC-C02.1 inserts one like and returns the committed count", async () => {
    await expect(
      repository.like({ memberId: ada.id, now: FIXED_NOW, tweetId }),
    ).resolves.toEqual({ likeCount: 1, liked: true, tweetId });

    const [stored] = await database.db.select().from(likes);
    expect(stored).toMatchObject({
      createdAt: FIXED_NOW,
      tweetId,
      userId: ada.id,
    });
  });

  it("US-C02 AC-C02.1 keeps a single like and the original timestamp on a repeat", async () => {
    await repository.like({ memberId: ada.id, now: FIXED_NOW, tweetId });

    const again = await repository.like({
      memberId: ada.id,
      now: new Date("2026-11-24T13:00:00.000Z"),
      tweetId,
    });

    expect(again).toMatchObject({ likeCount: 1, liked: true });
    const [stored] = await database.db.select().from(likes);
    expect(stored?.createdAt).toEqual(FIXED_NOW);
    await expect(database.db.$count(likes)).resolves.toBe(1);
  });

  it("lets an author like their own tweet", async () => {
    await expect(
      repository.like({ memberId: grace.id, now: FIXED_NOW, tweetId }),
    ).resolves.toMatchObject({ likeCount: 1, liked: true });
  });

  it("US-C02 stores nothing for an unknown or deleted tweet", async () => {
    await expect(
      repository.like({ memberId: ada.id, now: FIXED_NOW, tweetId: uuidv7() }),
    ).rejects.toThrow(LikeTargetNotFoundError);
    await database.db.delete(tweets).where(eq(tweets.id, tweetId));
    await expect(
      repository.like({ memberId: ada.id, now: FIXED_NOW, tweetId }),
    ).rejects.toThrow(LikeTargetNotFoundError);
    await expect(
      repository.unlike({ memberId: ada.id, tweetId }),
    ).rejects.toThrow(LikeTargetNotFoundError);
    await expect(database.db.$count(likes)).resolves.toBe(0);
  });

  it("maps a missing member to an absent target without leaking the driver error", async () => {
    await expect(
      repository.like({ memberId: uuidv7(), now: FIXED_NOW, tweetId }),
    ).rejects.toThrow(LikeTargetNotFoundError);
  });

  it("US-C02 AC-C02.1 removes the like once and reports the remaining count", async () => {
    await repository.like({ memberId: ada.id, now: FIXED_NOW, tweetId });
    await repository.like({ memberId: grace.id, now: FIXED_NOW, tweetId });

    const removed = await repository.unlike({ memberId: ada.id, tweetId });
    const again = await repository.unlike({ memberId: ada.id, tweetId });

    expect(removed).toEqual({ likeCount: 1, liked: false, tweetId });
    expect(again.likeCount).toBe(1);
    await expect(database.db.$count(likes)).resolves.toBe(1);
  });

  it("US-C02 AC-C02.4 keeps one like when the same like is committed concurrently", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.like({ memberId: ada.id, now: FIXED_NOW, tweetId }),
      ),
    );

    expect(results.every((result) => result.likeCount === 1)).toBe(true);
    await expect(database.db.$count(likes)).resolves.toBe(1);
  });

  it("US-C02 AC-C02.4 loses no like when many members like at once", async () => {
    const members = await manyMembers(12);

    const results = await Promise.all(
      members.map((member) =>
        repository.like({ memberId: member.id, now: FIXED_NOW, tweetId }),
      ),
    );

    for (const result of results) {
      expect(result.likeCount).toBeGreaterThanOrEqual(1);
      expect(result.likeCount).toBeLessThanOrEqual(members.length);
    }
    await expect(database.db.$count(likes)).resolves.toBe(members.length);
    await expect(
      repository.unlike({ memberId: ada.id, tweetId }),
    ).resolves.toMatchObject({ likeCount: members.length });
  });

  it("US-C02 AC-C02.4 never reports a negative count under concurrent unlikes", async () => {
    await repository.like({ memberId: ada.id, now: FIXED_NOW, tweetId });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.unlike({ memberId: ada.id, tweetId }),
      ),
    );

    expect(results.every((result) => result.likeCount === 0)).toBe(true);
    await expect(database.db.$count(likes)).resolves.toBe(0);
  });

  it("US-C02 AC-C02.4 settles concurrent likes and unlikes into a count that matches the rows", async () => {
    const members = await manyMembers(6);
    await Promise.all(
      members.map((member) =>
        repository.like({ memberId: member.id, now: FIXED_NOW, tweetId }),
      ),
    );

    await Promise.all(
      members.flatMap((member, index) =>
        index % 2 === 0
          ? [repository.unlike({ memberId: member.id, tweetId })]
          : [
              repository.like({ memberId: member.id, now: FIXED_NOW, tweetId }),
              repository.like({ memberId: ada.id, now: FIXED_NOW, tweetId }),
            ],
      ),
    );

    const rows = await database.db.$count(likes);
    expect(rows).toBe(members.length / 2 + 1);
    await expect(
      repository.like({ memberId: ada.id, now: FIXED_NOW, tweetId }),
    ).resolves.toMatchObject({ likeCount: rows });
  });

  it("US-B02 AC-B02.1 a like racing a delete either 404s or is removed with the tweet", async () => {
    const [liked, deleted] = await Promise.allSettled([
      repository.like({ memberId: ada.id, now: FIXED_NOW, tweetId }),
      database.db.delete(tweets).where(eq(tweets.id, tweetId)),
    ]);

    expect(deleted.status).toBe("fulfilled");
    if (liked.status === "rejected") {
      expect(liked.reason).toBeInstanceOf(LikeTargetNotFoundError);
    }
    await expect(database.db.$count(likes)).resolves.toBe(0);
  });
});
