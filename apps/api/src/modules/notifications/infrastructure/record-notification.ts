import { v7 as uuidv7 } from "uuid";

import { notifications } from "./notifications.schema.js";

import type { DatabaseExecutor } from "../../../platform/database/client.js";

/** A follow, like or reply that someone else should hear about. */
export type NotificationEvent =
  | { type: "follow"; actorId: string; recipientId: string }
  | { type: "like"; actorId: string; recipientId: string; tweetId: string }
  /** `tweetId` is the new reply, so deleting the reply removes the notice. */
  | { type: "reply"; actorId: string; recipientId: string; tweetId: string };

/**
 * One key per meaningful event: a member liking a tweet notifies once however
 * often they unlike and like again; a follow likewise; each reply once.
 */
export function notificationDedupeKey(event: NotificationEvent): string {
  switch (event.type) {
    case "follow":
      return `follow:${event.actorId}:${event.recipientId}`;
    case "like":
      return `like:${event.actorId}:${event.tweetId}`;
    case "reply":
      return `reply:${event.tweetId}`;
  }
}

/**
 * Records a notification inside the caller's transaction, so it commits or
 * rolls back with the action that caused it (no outbox worker needed for this
 * local app). Self-actions record nothing; a repeat is a no-op through the
 * unique dedupe key.
 */
export async function recordNotification(
  tx: DatabaseExecutor,
  event: NotificationEvent,
  now: Date,
): Promise<void> {
  if (event.actorId === event.recipientId) {
    return;
  }
  await tx
    .insert(notifications)
    .values({
      actorId: event.actorId,
      createdAt: now,
      dedupeKey: notificationDedupeKey(event),
      id: uuidv7(),
      recipientId: event.recipientId,
      tweetId: event.type === "follow" ? null : event.tweetId,
      type: event.type,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}
