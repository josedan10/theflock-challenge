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

/** One attached image: JPEG, PNG, or WebP (US-F02, MEDIA-01). */
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Largest accepted upload, in bytes (5 MiB). ASVS 5.0.0 V5.2.1. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Largest accepted width or height, in pixels. ASVS 5.0.0 V5.2.6. */
export const IMAGE_MAX_EDGE_PX = 4096;

/** Image description length in Unicode code points. It is the text alternative. */
export const IMAGE_ALT_MAX_LENGTH = 200;

/** How long an unattached upload stays usable, in seconds. */
export const UPLOAD_INTENT_TTL_SECONDS = 15 * 60;

export const imageMimeTypeSchema = z.enum(IMAGE_MIME_TYPES);

/** Description shown as the image's text alternative (AC-F02.4). */
export const imageAltSchema = z
  .string()
  .trim()
  .refine((value) => !value.includes("\u0000"), {
    message: "Must not contain a null character.",
  })
  .refine((value) => codePointLength(value) >= 1, {
    message: "Describe the image.",
  })
  .refine((value) => codePointLength(value) <= IMAGE_ALT_MAX_LENGTH, {
    message: "Must be at most 200 characters.",
  });

/**
 * Image already verified for this member. The tweet body never carries bytes.
 * Unknown keys are rejected.
 */
export const attachImageSchema = z.strictObject({
  alt: imageAltSchema,
  uploadId: z.uuid(),
});

/** Image on a tweet card. `url` is this API's object URL. */
export const tweetImageSchema = z.object({
  alt: z.string().min(1),
  height: z.number().int().positive().max(IMAGE_MAX_EDGE_PX),
  url: z.url(),
  width: z.number().int().positive().max(IMAGE_MAX_EDGE_PX),
});

/** Image attached to a card, or `null` when the tweet is text only. */
export type TweetImage = z.infer<typeof tweetImageSchema>;

/**
 * `POST /v1/media/upload-intents` body (US-F02). Declares the file before any
 * bytes are sent. Unknown keys are rejected.
 */
export const uploadIntentRequestSchema = z.strictObject({
  byteSize: z
    .number()
    .int()
    .min(1, "Choose an image.")
    .max(IMAGE_MAX_BYTES, "Images must be 5 MB or smaller."),
  mimeType: imageMimeTypeSchema,
});

/** Validated upload intent. */
export type UploadIntentRequest = z.infer<typeof uploadIntentRequestSchema>;

/** Short-lived upload grant. The token is shown once and is not a session. */
export const uploadIntentResponseSchema = z.object({
  expiresAt: z.iso.datetime({ offset: false }),
  uploadId: z.uuid(),
  uploadPath: z.string().startsWith("/v1/media/uploads/"),
  uploadToken: z.string().min(1),
});

/** Parsed upload intent. */
export type UploadIntentResponse = z.infer<typeof uploadIntentResponseSchema>;

/** Public object URL for an attached image. `origin` has no trailing slash. */
export function mediaObjectUrl(origin: string, objectKey: string): string {
  return `${origin}/v1/media/objects/${objectKey}`;
}

/** `POST /v1/tweets` body (US-B01). Unknown keys are rejected. */
export const createTweetRequestSchema = z.strictObject({
  content: tweetContentSchema,
  image: attachImageSchema.optional(),
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
  /** Attached image, or `null` for a text-only tweet (US-F02). */
  image: tweetImageSchema.nullable(),
  likeCount: z.number().int().nonnegative(),
  likedByViewer: z.boolean(),
  /** Direct replies only, from committed rows; the chat bubble's count. */
  replyCount: z.number().int().nonnegative(),
});

/** Tweet card. */
export type Tweet = z.infer<typeof tweetSchema>;

/** Response body for `POST /v1/tweets` (`201`). */
export const createTweetResponseSchema = z.object({ tweet: tweetSchema });

/** Parsed create-tweet response. */
export type CreateTweetResponse = z.infer<typeof createTweetResponseSchema>;
