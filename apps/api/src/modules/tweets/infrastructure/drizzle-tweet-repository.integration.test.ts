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

import { createDrizzleTweetRepository } from "./drizzle-tweet-repository.js";
import { tweets } from "./tweets.schema.js";

import type { StoredUser } from "../../auth/application/ports.js";
import type { NewTweet, TweetRepository } from "../application/ports.js";

let database: TestDatabase;
let repository: TweetRepository;
let author: StoredUser;
let other: StoredUser;

beforeAll(async () => {
  database = await startTestDatabase();
  repository = createDrizzleTweetRepository(database.db);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
  const members = createDrizzleUserRepository(database.db);
  author = await members.create(buildNewUser({ displayName: "Ada" }));
  other = await members.create(buildNewUser());
});

const newTweet = (overrides: Partial<NewTweet> = {}): NewTweet => ({
  authorId: author.id,
  content: "Hello, world",
  id: uuidv7(),
  now: FIXED_NOW,
  ...overrides,
});

describe("tweet persistence", () => {
  it("US-B01 AC-B01.1 stores a tweet and returns its card with public author fields", async () => {
    const input = newTweet();

    const card = await repository.create(input);

    expect(card).toEqual({
      author: {
        avatarKey: null,
        displayName: "Ada",
        id: author.id,
        username: author.username,
      },
      content: "Hello, world",
      createdAt: FIXED_NOW,
      id: input.id,
      likeCount: 0,
      likedByViewer: false,
    });
    await expect(database.db.$count(tweets)).resolves.toBe(1);
  });

  it("US-B01 AC-B01.1 stores exactly 280 characters, including emoji", async () => {
    await expect(
      repository.create(newTweet({ content: "a".repeat(280) })),
    ).resolves.toBeDefined();
    await expect(
      repository.create(newTweet({ content: "🐦".repeat(280) })),
    ).resolves.toBeDefined();
  });

  describe("database invariants backing the contract", () => {
    it.each([
      ["blank content", ""],
      ["whitespace-only content", "   "],
      ["untrimmed content", " hello "],
      ["281 characters", "a".repeat(281)],
    ])("US-B01 AC-B01.2 rejects %s", async (_case, content) => {
      await expect(repository.create(newTweet({ content }))).rejects.toThrow();
      await expect(database.db.$count(tweets)).resolves.toBe(0);
    });

    it("rejects a tweet for an unknown author", async () => {
      await expect(
        repository.create(newTweet({ authorId: uuidv7() })),
      ).rejects.toThrow();
    });

    it("prevents deleting a member who still has tweets", async () => {
      await repository.create(newTweet());

      await expect(
        database.db.delete(users).where(eq(users.id, author.id)),
      ).rejects.toThrow();
    });
  });

  describe("ownership-checked delete", () => {
    it("US-B02 AC-B02.1 lets the author delete their tweet", async () => {
      const { id } = await repository.create(newTweet());

      await expect(repository.deleteOwned(id, author.id)).resolves.toBe(
        "deleted",
      );
      await expect(database.db.$count(tweets)).resolves.toBe(0);
    });

    it("US-B02 AC-B02.2 refuses another member and keeps the tweet", async () => {
      const { id } = await repository.create(newTweet());

      await expect(repository.deleteOwned(id, other.id)).resolves.toBe(
        "not-author",
      );
      await expect(database.db.$count(tweets)).resolves.toBe(1);
    });

    it("US-B02 AC-B02.2 reports an unknown or already-deleted tweet as not found", async () => {
      const { id } = await repository.create(newTweet());
      await repository.deleteOwned(id, author.id);

      await expect(repository.deleteOwned(id, author.id)).resolves.toBe(
        "not-found",
      );
      await expect(repository.deleteOwned(uuidv7(), author.id)).resolves.toBe(
        "not-found",
      );
    });

    it("US-B02 AC-B02.2 lets exactly one of two concurrent deletes succeed", async () => {
      const { id } = await repository.create(newTweet());

      const outcomes = await Promise.all([
        repository.deleteOwned(id, author.id),
        repository.deleteOwned(id, author.id),
      ]);

      expect(outcomes.sort()).toEqual(["deleted", "not-found"]);
    });
  });
});
