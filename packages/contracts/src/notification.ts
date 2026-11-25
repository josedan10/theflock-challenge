import { z } from "zod";

import {
  TIMELINE_CURSOR_MAX_LENGTH,
  TIMELINE_MAX_LIMIT,
  timelineQuerySchema,
} from "./timeline";
import { tweetAuthorSchema } from "./tweet";

/** What happened: someone followed you, liked or replied to your tweet. */
export const notificationTypeSchema = z.enum(["follow", "like", "reply"]);

/** A notification's kind. */
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/**
 * One notification for the signed-in member (NOT-01). `actor` carries public
 * fields only. `tweet` is the liked tweet or the new reply, and `null` for a
 * follow. Its text is plain and must be escaped when rendered. `read` is the
 * recipient's own state.
 */
export const notificationSchema = z.strictObject({
  actor: tweetAuthorSchema,
  createdAt: z.iso.datetime({ offset: false }),
  id: z.uuid(),
  read: z.boolean(),
  tweet: z.strictObject({ content: z.string(), id: z.uuid() }).nullable(),
  type: notificationTypeSchema,
});

/** Parsed notification. */
export type Notification = z.infer<typeof notificationSchema>;

/** `GET /v1/notifications` query: the timeline's cursor and limit rules. */
export const notificationQuerySchema = timelineQuerySchema;

/** Newest first; a null cursor means there is nothing older. */
export const notificationPageSchema = z.strictObject({
  items: z.array(notificationSchema).max(TIMELINE_MAX_LIMIT),
  nextCursor: z.string().min(1).max(TIMELINE_CURSOR_MAX_LENGTH).nullable(),
});

/** Parsed notifications page. */
export type NotificationPage = z.infer<typeof notificationPageSchema>;

/** Unread notifications for the badge, from committed rows. */
export const unreadCountResponseSchema = z.strictObject({
  unreadCount: z.number().int().nonnegative(),
});

/** Parsed unread count. */
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;

/** Maximum ids marked read by one request. */
export const MARK_READ_MAX_IDS = 50;

/**
 * `POST /v1/notifications/read` body: specific ids, or `all` for everything
 * received so far. Ids that are not the member's own are ignored.
 */
export const markReadRequestSchema = z.union([
  z.strictObject({
    ids: z.array(z.uuid()).min(1).max(MARK_READ_MAX_IDS),
  }),
  z.strictObject({ all: z.literal(true) }),
]);

/** Parsed mark-read request. */
export type MarkReadRequest = z.infer<typeof markReadRequestSchema>;
