import { z } from "zod";

import {
  TIMELINE_CURSOR_MAX_LENGTH,
  TIMELINE_DEFAULT_LIMIT,
  TIMELINE_MAX_LIMIT,
  timelineQuerySchema,
} from "./timeline";
import { tweetAuthorSchema } from "./tweet";

/** Page sizes and cursor bounds match the home timeline. */
export const FOLLOW_LIST_DEFAULT_LIMIT = TIMELINE_DEFAULT_LIMIT;
export const FOLLOW_LIST_MAX_LIMIT = TIMELINE_MAX_LIMIT;

/**
 * `GET /v1/users/:username/followers` and `/following` query (US-C03).
 * Same rules as the timeline: optional signed cursor, capped positive limit.
 */
export const followListQuerySchema = timelineQuerySchema;

/**
 * One member in a followers or following list.
 *
 * `followedByViewer` is whether the signed-in viewer follows this member;
 * always `false` when signed out. `isViewer` marks the viewer's own row, which
 * gets no follow button (AC-C03.1).
 */
export const followListItemSchema = z.strictObject({
  followedByViewer: z.boolean(),
  isViewer: z.boolean(),
  user: tweetAuthorSchema,
});

/** A listed member and their relationship to the viewer. */
export type FollowListItem = z.infer<typeof followListItemSchema>;

/** A null cursor means the end of the list (AC-C03.2). */
export const followListPageSchema = z.strictObject({
  items: z.array(followListItemSchema).max(FOLLOW_LIST_MAX_LIMIT),
  nextCursor: z.string().min(1).max(TIMELINE_CURSOR_MAX_LENGTH).nullable(),
});

/** Parsed followers or following page. */
export type FollowListPage = z.infer<typeof followListPageSchema>;
