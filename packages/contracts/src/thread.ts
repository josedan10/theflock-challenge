import { z } from "zod";

import {
  TIMELINE_CURSOR_MAX_LENGTH,
  TIMELINE_MAX_LIMIT,
  timelineQuerySchema,
} from "./timeline";
import { tweetSchema } from "./tweet";

export const threadQuerySchema = timelineQuerySchema;
export const threadIdSchema = z.uuid();
/** The direct parent is returned even when the selected tweet is itself a reply. */
export const threadItemSchema = tweetSchema.extend({
  parentTweetId: z.uuid().nullable(),
});
export const threadPageSchema = z.strictObject({
  selected: threadItemSchema,
  items: z.array(threadItemSchema).max(TIMELINE_MAX_LIMIT),
  nextCursor: z.string().min(1).max(TIMELINE_CURSOR_MAX_LENGTH).nullable(),
});
/** Selected tweet and one oldest-first descendant page (US-B04). */
export type ThreadPage = z.infer<typeof threadPageSchema>;
/** A public card and its stable parent link. */
export type ThreadItem = z.infer<typeof threadItemSchema>;
