import { describe, expect, it } from "vitest";

import {
  createTweetRequestSchema,
  createTweetResponseSchema,
  TWEET_MAX_LENGTH,
} from "./tweet";

const parse = (content: unknown) =>
  createTweetRequestSchema.safeParse({ content });

describe("tweet content contract", () => {
  it("US-B01 AC-B01.1 accepts 1 through 280 characters and trims the edges", () => {
    expect(parse("a").success).toBe(true);
    expect(parse("a".repeat(TWEET_MAX_LENGTH)).success).toBe(true);
    expect(
      createTweetRequestSchema.parse({ content: "  hello\nworld  " }),
    ).toEqual({
      content: "hello\nworld",
    });
  });

  it.each([
    ["empty", ""],
    ["whitespace-only", " \n\t "],
    ["281 characters", "a".repeat(TWEET_MAX_LENGTH + 1)],
    ["a null character", "a\u0000b"],
    ["not a string", 42],
  ])("US-B01 AC-B01.2 rejects %s content", (_case, content) => {
    expect(parse(content).success).toBe(false);
  });

  it("US-B01 AC-B01.1 counts emoji as one character each", () => {
    expect(parse("🐦".repeat(TWEET_MAX_LENGTH)).success).toBe(true);
    expect(parse("🐦".repeat(TWEET_MAX_LENGTH + 1)).success).toBe(false);
  });

  it("measures the limit after trimming", () => {
    expect(parse(`  ${"a".repeat(TWEET_MAX_LENGTH)}  `).success).toBe(true);
  });

  it("rejects unknown fields so clients cannot set authors or timestamps", () => {
    expect(
      createTweetRequestSchema.safeParse({ authorId: "x", content: "hi" })
        .success,
    ).toBe(false);
  });
});

describe("tweet card contract", () => {
  const tweet = {
    author: {
      avatarUrl: null,
      displayName: "Ada",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
      username: "ada",
    },
    content: "hello",
    createdAt: "2026-11-24T12:00:00.000Z",
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
    likeCount: 0,
    likedByViewer: false,
  };

  it("US-B01 AC-B01.1 accepts a complete card", () => {
    expect(createTweetResponseSchema.parse({ tweet })).toEqual({ tweet });
  });

  it("strips author secrets accidentally included in the payload", () => {
    const parsed = createTweetResponseSchema.parse({
      tweet: {
        ...tweet,
        author: { ...tweet.author, email: "ada@example.com" },
      },
    });

    expect(parsed.tweet.author).not.toHaveProperty("email");
  });
});
