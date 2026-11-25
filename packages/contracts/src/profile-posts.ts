import { z } from "zod";

import { STORED_USERNAME_PATTERN } from "./auth";
import {
  TIMELINE_CURSOR_MAX_LENGTH,
  TIMELINE_MAX_LIMIT,
  timelineQuerySchema,
} from "./timeline";
import { tweetSchema } from "./tweet";

/**
 * `GET /v1/users/:username/tweets` query (PROFILE-03, AC-A03.4).
 *
 * Same rules as the home timeline: omit `cursor` on the first page, pass it
 * back unchanged, and cap `limit` at 30.
 */
export const profilePostsQuerySchema = timelineQuerySchema;

/**
 * One card on a profile. A root tweet has `replyingTo: null`. A reply names
 * the parent author's username when that member is still visible.
 */
export const profilePostSchema = tweetSchema.extend({
  replyingTo: z.string().regex(STORED_USERNAME_PATTERN).nullable(),
});

/** A profile card, including whether it is a reply. */
export type ProfilePost = z.infer<typeof profilePostSchema>;

/** A null cursor means the end of that member's posts (AC-A03.4). */
export const profilePostsPageSchema = z.strictObject({
  items: z.array(profilePostSchema).max(TIMELINE_MAX_LIMIT),
  nextCursor: z.string().min(1).max(TIMELINE_CURSOR_MAX_LENGTH).nullable(),
});

/** One page of a member's tweets and replies. */
export type ProfilePostsPage = z.infer<typeof profilePostsPageSchema>;
