import type { SignedKeysetCursor } from "../../../platform/pagination/signed-keyset-cursor.js";
import type { NotificationStore } from "./ports.js";
import type {
  MarkReadRequest,
  NotificationPage,
} from "@twitter-clone/contracts";

export interface NotificationDependencies {
  store: NotificationStore;
  cursors: SignedKeysetCursor;
  clock: () => Date;
}

/**
 * Reading and clearing the signed-in member's notifications (NOT-01).
 *
 * Every operation takes the recipient from the session. Cursors are scoped to
 * that member, so one member's cursor fails for anyone else.
 *
 * @throws {InvalidKeysetCursorError} From `list` for a bad or foreign cursor.
 */
export function createNotificationUseCases(deps: NotificationDependencies) {
  return {
    async list(
      recipientId: string,
      limit: number,
      cursor?: string,
    ): Promise<NotificationPage> {
      const before =
        cursor === undefined ? null : deps.cursors.decode(recipientId, cursor);
      const rows = await deps.store.page(recipientId, before, limit + 1);
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return {
        items: items.map((row) => ({
          actor: {
            avatarUrl: null,
            displayName: row.actor.displayName,
            id: row.actor.id,
            username: row.actor.username,
          },
          createdAt: row.createdAt,
          id: row.id,
          read: row.read,
          tweet: row.tweet,
          type: row.type,
        })),
        nextCursor:
          rows.length > limit && last !== undefined
            ? deps.cursors.encode(recipientId, {
                createdAt: last.createdAt,
                id: last.id,
              })
            : null,
      };
    },

    unreadCount: (recipientId: string) => deps.store.unreadCount(recipientId),

    /** Applies the request and returns the committed unread count. */
    async markRead(
      recipientId: string,
      request: MarkReadRequest,
    ): Promise<number> {
      const now = deps.clock();
      if ("all" in request) {
        await deps.store.markAllRead(recipientId, now);
      } else {
        await deps.store.markRead(recipientId, request.ids, now);
      }
      return deps.store.unreadCount(recipientId);
    },
  };
}

export type NotificationUseCases = ReturnType<
  typeof createNotificationUseCases
>;
