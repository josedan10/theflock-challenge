import { z } from "zod";

import { codePointLength, STORED_USERNAME_PATTERN } from "./auth";

/** Maximum tweet length in Unicode code points (AC-B01.1). */
export const TWEET_MAX_LENGTH = 280;

/**
 * Tweet text, stored and returned as plain text that clients must escape.
 *
 * Surrounding whitespace is trimmed; what remains must be 1–280 characters,
 * so empty and whitespace-only posts are rejected (AC-B01.2). Emoji count as
 * one character each.
 */
export const tweetContentSchema = z
  .string()
  .trim()
  .refine((value) => value.length > 0, { message: "Write something to post." })
  .refine((value) => !value.includes("\u0000"), {
    message: "Must not contain a null character.",
  })
  .refine((value) => codePointLength(value) <= TWEET_MAX_LENGTH, {
    message: "Must be at most 280 characters.",
  });

/** `POST /v1/tweets` body (US-B01). Unknown keys are rejected. */
export const createTweetRequestSchema = z.strictObject({
  content: tweetContentSchema,
});

/** Validated tweet creation input. */
export type CreateTweetRequest = z.infer<typeof createTweetRequestSchema>;

/** The author fields a tweet card shows; never email or credentials. */
export const tweetAuthorSchema = z.object({
  avatarUrl: z.url().nullable(),
  displayName: z.string().min(1),
  id: z.uuid(),
  username: z.string().regex(STORED_USERNAME_PATTERN),
});

/**
 * Tweet card view model. The API returns it complete, so clients never invent
 * timestamps or counts (API conventions).
 */
export const tweetSchema = z.object({
  author: tweetAuthorSchema,
  content: z.string().min(1),
  createdAt: z.iso.datetime({ offset: false }),
  id: z.uuid(),
  likeCount: z.number().int().nonnegative(),
  likedByViewer: z.boolean(),
});

/** Tweet card. */
export type Tweet = z.infer<typeof tweetSchema>;

/** Response body for `POST /v1/tweets` (`201`). */
export const createTweetResponseSchema = z.object({ tweet: tweetSchema });

/** Parsed create-tweet response. */
export type CreateTweetResponse = z.infer<typeof createTweetResponseSchema>;
