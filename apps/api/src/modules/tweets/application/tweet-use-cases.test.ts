import { describe, expect, it } from "vitest";

import { NotTweetAuthorError, TweetNotFoundError } from "../domain/errors.js";

import { createCreateTweet } from "./create-tweet.js";
import { createDeleteTweet } from "./delete-tweet.js";

import type { NewTweet, TweetCard, TweetRepository } from "./ports.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");

/** In-memory repository with the same ownership semantics as the real one. */
function fakeTweets() {
  const stored = new Map<string, NewTweet>();
  const repository: TweetRepository = {
    async create(tweet): Promise<TweetCard> {
      stored.set(tweet.id, tweet);
      return {
        author: {
          avatarKey: null,
          displayName: "Ada",
          id: tweet.authorId,
          username: "ada",
        },
        content: tweet.content,
        createdAt: tweet.now,
        id: tweet.id,
        likeCount: 0,
        likedByViewer: false,
      };
    },
    async deleteOwned(tweetId, authorId) {
      const tweet = stored.get(tweetId);
      if (tweet === undefined) {
        return "not-found";
      }
      if (tweet.authorId !== authorId) {
        return "not-author";
      }
      stored.delete(tweetId);
      return "deleted";
    },
  };
  return { repository, stored };
}

describe("create tweet", () => {
  it("US-B01 AC-B01.1 stores the content for the authenticated author with a server id and time", async () => {
    const { repository, stored } = fakeTweets();
    const createTweet = createCreateTweet({
      clock: () => NOW,
      generateId: () => "tweet-1",
      tweets: repository,
    });

    const card = await createTweet({ authorId: "member-1", content: "hello" });

    expect(stored.get("tweet-1")).toEqual({
      authorId: "member-1",
      content: "hello",
      id: "tweet-1",
      now: NOW,
    });
    expect(card).toMatchObject({
      content: "hello",
      createdAt: NOW,
      id: "tweet-1",
    });
  });
});

describe("delete tweet", () => {
  async function withTweet() {
    const { repository, stored } = fakeTweets();
    await repository.create({
      authorId: "author",
      content: "hi",
      id: "tweet-1",
      now: NOW,
    });
    return { deleteTweet: createDeleteTweet(repository), stored };
  }

  it("US-B02 AC-B02.1 deletes the author's own tweet", async () => {
    const { deleteTweet, stored } = await withTweet();

    await expect(
      deleteTweet({ memberId: "author", tweetId: "tweet-1" }),
    ).resolves.toBeUndefined();
    expect(stored.size).toBe(0);
  });

  it("US-B02 AC-B02.2 refuses another member with NotTweetAuthorError", async () => {
    const { deleteTweet, stored } = await withTweet();

    await expect(
      deleteTweet({ memberId: "intruder", tweetId: "tweet-1" }),
    ).rejects.toBeInstanceOf(NotTweetAuthorError);
    expect(stored.size).toBe(1);
  });

  it("US-B02 AC-B02.2 reports unknown and repeat deletes as TweetNotFoundError", async () => {
    const { deleteTweet } = await withTweet();
    await deleteTweet({ memberId: "author", tweetId: "tweet-1" });

    await expect(
      deleteTweet({ memberId: "author", tweetId: "tweet-1" }),
    ).rejects.toBeInstanceOf(TweetNotFoundError);
    await expect(
      deleteTweet({ memberId: "author", tweetId: "missing" }),
    ).rejects.toBeInstanceOf(TweetNotFoundError);
  });
});
