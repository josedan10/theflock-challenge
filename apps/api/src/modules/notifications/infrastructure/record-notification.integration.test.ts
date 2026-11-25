import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { notifications } from "../../../platform/database/schema.js";
import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";
import { createDrizzleFollowRepository } from "../../social/infrastructure/drizzle-follow-repository.js";
import { createDrizzleLikeRepository } from "../../social/infrastructure/drizzle-like-repository.js";
import { createDrizzleTweetRepository } from "../../tweets/infrastructure/drizzle-tweet-repository.js";

import type { StoredUser } from "../../auth/application/ports.js";

let database: TestDatabase;
let ada: StoredUser;
let grace: StoredUser;
let adaTweet: string;

beforeAll(async () => {
  database = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

const tweetsRepo = () => createDrizzleTweetRepository(database.db);
const likesRepo = () => createDrizzleLikeRepository(database.db);
const followsRepo = () => createDrizzleFollowRepository(database.db);

async function postTweet(authorId: string, parentTweetId?: string) {
  const card = await tweetsRepo().create({
    authorId,
    content: "hello",
    id: uuidv7(),
    now: FIXED_NOW,
    ...(parentTweetId === undefined ? {} : { parentTweetId }),
  });
  return card.id;
}

const stored = () =>
  database.db
    .select({
      actorId: notifications.actorId,
      recipientId: notifications.recipientId,
      tweetId: notifications.tweetId,
      type: notifications.type,
    })
    .from(notifications)
    // UUIDv7 ids sort in creation order.
    .orderBy(notifications.id);

beforeEach(async () => {
  await database.reset();
  const members = createDrizzleUserRepository(database.db);
  ada = await members.create(buildNewUser({ username: "ada" }));
  grace = await members.create(buildNewUser({ username: "grace" }));
  adaTweet = await postTweet(ada.id);
});

describe("notifications written with social actions", () => {
  it("NOT-01 notifies the author of a like once, however often it repeats", async () => {
    const like = () =>
      likesRepo().like({
        memberId: grace.id,
        now: FIXED_NOW,
        tweetId: adaTweet,
      });

    await like();
    await likesRepo().unlike({ memberId: grace.id, tweetId: adaTweet });
    await like();
    await Promise.all(Array.from({ length: 6 }, like));

    await expect(stored()).resolves.toEqual([
      {
        actorId: grace.id,
        recipientId: ada.id,
        tweetId: adaTweet,
        type: "like",
      },
    ]);
  });

  it("NOT-01 notifies the followed member once, even after an unfollow", async () => {
    await followsRepo().follow({
      followerId: grace.id,
      now: FIXED_NOW,
      username: "ada",
    });
    await followsRepo().unfollow({ followerId: grace.id, username: "ada" });
    await followsRepo().follow({
      followerId: grace.id,
      now: FIXED_NOW,
      username: "ada",
    });

    await expect(stored()).resolves.toEqual([
      { actorId: grace.id, recipientId: ada.id, tweetId: null, type: "follow" },
    ]);
  });

  it("NOT-01 notifies the parent's author of each reply, and removes it with the reply", async () => {
    const reply = await postTweet(grace.id, adaTweet);
    const second = await postTweet(grace.id, adaTweet);

    await expect(stored()).resolves.toEqual([
      { actorId: grace.id, recipientId: ada.id, tweetId: reply, type: "reply" },
      {
        actorId: grace.id,
        recipientId: ada.id,
        tweetId: second,
        type: "reply",
      },
    ]);

    await tweetsRepo().deleteOwned(reply, grace.id);
    const left = await stored();
    expect(left.map((row) => row.tweetId)).toEqual([second]);
  });

  it("NOT-01 never notifies a member of their own like or reply", async () => {
    await likesRepo().like({
      memberId: ada.id,
      now: FIXED_NOW,
      tweetId: adaTweet,
    });
    await postTweet(ada.id, adaTweet);

    await expect(stored()).resolves.toEqual([]);
  });

  it("NOT-01 rolls the notification back with a failed action", async () => {
    await expect(
      likesRepo().like({
        memberId: grace.id,
        now: FIXED_NOW,
        tweetId: uuidv7(),
      }),
    ).rejects.toThrow();
    await expect(postTweet(grace.id, uuidv7())).rejects.toThrow();

    await expect(database.db.$count(notifications)).resolves.toBe(0);
  });

  it("NOT-01 removes a like's notification when the liked tweet is deleted", async () => {
    await likesRepo().like({
      memberId: grace.id,
      now: FIXED_NOW,
      tweetId: adaTweet,
    });

    await tweetsRepo().deleteOwned(adaTweet, ada.id);

    await expect(
      database.db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientId, ada.id)),
    ).resolves.toEqual([]);
  });
});
