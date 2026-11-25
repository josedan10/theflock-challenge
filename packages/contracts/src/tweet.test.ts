import { describe, expect, it } from "vitest";

import {
  createTweetRequestSchema,
  createTweetResponseSchema,
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_MAX_BYTES,
  TWEET_MAX_LENGTH,
  uploadIntentRequestSchema,
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

  it("US-F02 AC-F02.1 accepts one JPEG, PNG, or WebP within 5 MB and rejects the rest", () => {
    expect(
      uploadIntentRequestSchema.safeParse({
        byteSize: 1,
        mimeType: "image/png",
      }).success,
    ).toBe(true);
    expect(
      uploadIntentRequestSchema.safeParse({
        byteSize: IMAGE_MAX_BYTES,
        mimeType: "image/webp",
      }).success,
    ).toBe(true);
    for (const mimeType of ["image/gif", "image/svg+xml", "text/plain"]) {
      expect(
        uploadIntentRequestSchema.safeParse({ byteSize: 10, mimeType }).success,
      ).toBe(false);
    }
    expect(
      uploadIntentRequestSchema.safeParse({
        byteSize: IMAGE_MAX_BYTES + 1,
        mimeType: "image/jpeg",
      }).success,
    ).toBe(false);
    expect(
      uploadIntentRequestSchema.safeParse({
        byteSize: 10,
        filename: "../etc/passwd",
        mimeType: "image/jpeg",
      }).success,
    ).toBe(false);
  });

  it("US-F02 AC-F02.3 attaches one described image and still accepts text alone", () => {
    const uploadId = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f70";
    expect(parse("hello").success).toBe(true);
    expect(
      createTweetRequestSchema.parse({
        content: "hello",
        image: { alt: "  a red square  ", uploadId },
      }),
    ).toEqual({
      content: "hello",
      image: { alt: "a red square", uploadId },
    });
    expect(
      createTweetRequestSchema.safeParse({
        content: "hello",
        image: { alt: "a".repeat(IMAGE_ALT_MAX_LENGTH + 1), uploadId },
      }).success,
    ).toBe(false);
    expect(
      createTweetRequestSchema.safeParse({
        content: "hello",
        image: { alt: "   ", uploadId },
      }).success,
    ).toBe(false);
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
    image: null,
    likeCount: 0,
    likedByViewer: false,
    replyCount: 0,
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

  it.each([
    ["a missing reply count", { replyCount: undefined }],
    ["a negative reply count", { replyCount: -1 }],
    ["a fractional reply count", { replyCount: 0.5 }],
  ])("US-B04 rejects %s", (_case, patch) => {
    expect(
      createTweetResponseSchema.safeParse({ tweet: { ...tweet, ...patch } })
        .success,
    ).toBe(false);
  });
});
