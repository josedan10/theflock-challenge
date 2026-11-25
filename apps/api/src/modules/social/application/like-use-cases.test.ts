import { describe, expect, it } from "vitest";

import { LikeTargetNotFoundError } from "../domain/errors.js";

import { createLikeTweet } from "./like-tweet.js";
import { createUnlikeTweet } from "./unlike-tweet.js";

import type {
  LikeRepository,
  LikeState,
  LikeWrite,
  UnlikeWrite,
} from "./ports.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const LATER = new Date("2026-11-24T13:00:00.000Z");
const TWEET_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f70";
const MISSING_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f79";

function fakeLikes() {
  const rows = new Map<string, Date>();
  const key = (memberId: string, tweetId: string) => `${memberId}:${tweetId}`;
  const count = (tweetId: string) =>
    [...rows.keys()].filter((row) => row.endsWith(`:${tweetId}`)).length;
  const requireTweet = (tweetId: string) => {
    if (tweetId !== TWEET_ID) {
      throw new LikeTargetNotFoundError();
    }
  };
  const repository: LikeRepository = {
    async like(input: LikeWrite): Promise<LikeState> {
      requireTweet(input.tweetId);
      const row = key(input.memberId, input.tweetId);
      if (!rows.has(row)) {
        rows.set(row, input.now);
      }
      return {
        likeCount: count(input.tweetId),
        liked: true,
        tweetId: input.tweetId,
      };
    },
    async unlike(input: UnlikeWrite): Promise<LikeState> {
      requireTweet(input.tweetId);
      rows.delete(key(input.memberId, input.tweetId));
      return {
        likeCount: count(input.tweetId),
        liked: false,
        tweetId: input.tweetId,
      };
    },
  };
  return { repository, rows };
}

describe("like tweet", () => {
  it("US-C02 AC-C02.1 likes once with the clock instant and returns the count", async () => {
    const { repository, rows } = fakeLikes();
    const like = createLikeTweet({ clock: () => NOW, likes: repository });

    await expect(
      like({ memberId: "ada-id", tweetId: TWEET_ID }),
    ).resolves.toEqual({ likeCount: 1, liked: true, tweetId: TWEET_ID });
    expect(rows.get(`ada-id:${TWEET_ID}`)).toEqual(NOW);
  });

  it("US-C02 AC-C02.1 keeps one like and the original instant on a repeat", async () => {
    const { repository, rows } = fakeLikes();
    let now = NOW;
    const like = createLikeTweet({ clock: () => now, likes: repository });
    await like({ memberId: "ada-id", tweetId: TWEET_ID });
    now = LATER;

    await expect(
      like({ memberId: "ada-id", tweetId: TWEET_ID }),
    ).resolves.toMatchObject({ likeCount: 1, liked: true });
    expect(rows.get(`ada-id:${TWEET_ID}`)).toEqual(NOW);
  });

  it("US-C02 surfaces an unknown tweet", async () => {
    const { repository } = fakeLikes();
    const like = createLikeTweet({ clock: () => NOW, likes: repository });

    await expect(
      like({ memberId: "ada-id", tweetId: MISSING_ID }),
    ).rejects.toBeInstanceOf(LikeTargetNotFoundError);
  });
});

describe("unlike tweet", () => {
  it("US-C02 AC-C02.1 removes the like and stays a no-op when repeated", async () => {
    const { repository } = fakeLikes();
    const like = createLikeTweet({ clock: () => NOW, likes: repository });
    const unlike = createUnlikeTweet({ likes: repository });
    await like({ memberId: "ada-id", tweetId: TWEET_ID });
    await like({ memberId: "grace-id", tweetId: TWEET_ID });

    await expect(
      unlike({ memberId: "ada-id", tweetId: TWEET_ID }),
    ).resolves.toEqual({ likeCount: 1, liked: false, tweetId: TWEET_ID });
    await expect(
      unlike({ memberId: "ada-id", tweetId: TWEET_ID }),
    ).resolves.toEqual({ likeCount: 1, liked: false, tweetId: TWEET_ID });
  });

  it("US-C02 surfaces an unknown tweet", async () => {
    const { repository } = fakeLikes();
    const unlike = createUnlikeTweet({ likes: repository });

    await expect(
      unlike({ memberId: "ada-id", tweetId: MISSING_ID }),
    ).rejects.toBeInstanceOf(LikeTargetNotFoundError);
  });
});
