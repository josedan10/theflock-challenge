import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { notifications } from "./notifications.schema.js";

import type { DatabaseExecutor } from "../../../platform/database/client.js";
import type {
  NotificationEntry,
  NotificationStore,
} from "../application/ports.js";
import type { NotificationType } from "@twitter-clone/contracts";

interface NotificationRow extends Record<string, unknown> {
  id: string;
  type: NotificationType;
  created_at: string;
  read: boolean;
  actor_id: string;
  username: string;
  display_name: string;
  tweet_id: string | null;
  content: string | null;
}

/**
 * One recipient's page, newest first, through
 * `notifications_recipient_created_id_idx`. A strict `(created_at, id)`
 * boundary never repeats the anchor. Soft-deleted actors are hidden; deleted
 * tweets already took their notifications with them.
 */
export function notificationPageQuery(
  recipientId: string,
  before: { createdAt: string; id: string } | null,
  count: number,
) {
  const boundary =
    before === null
      ? sql``
      : sql`and (n.created_at, n.id) < (${before.createdAt}::timestamptz, ${before.id}::uuid)`;
  return sql`
    select n.id, n.type, n.read_at is not null as read,
      to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      u.id as actor_id, u.username, u.display_name, t.id as tweet_id, t.content
    from notifications n
    join users u on u.id = n.actor_id and u.deleted_at is null
    left join tweets t on t.id = n.tweet_id
    where n.recipient_id = ${recipientId}::uuid ${boundary}
    order by n.created_at desc, n.id desc
    limit ${count}`;
}

/** Notifications against PostgreSQL. */
export function createDrizzleNotificationStore(
  db: DatabaseExecutor,
): NotificationStore {
  return {
    async page(recipientId, before, count): Promise<NotificationEntry[]> {
      const rows = await db.execute<NotificationRow>(
        notificationPageQuery(recipientId, before, count),
      );
      return rows.map((row) => ({
        actor: {
          displayName: row.display_name,
          id: row.actor_id,
          username: row.username,
        },
        createdAt: row.created_at,
        id: row.id,
        read: row.read,
        tweet:
          row.tweet_id === null || row.content === null
            ? null
            : { content: row.content, id: row.tweet_id },
        type: row.type,
      }));
    },

    async unreadCount(recipientId) {
      // Served by notifications_recipient_unread_idx. Like the list, it skips
      // notifications from soft-deleted actors.
      const [row] = await db.execute<{ count: number }>(sql`
        select cast(count(*) as integer) as count
        from notifications n
        join users u on u.id = n.actor_id and u.deleted_at is null
        where n.recipient_id = ${recipientId}::uuid and n.read_at is null`);
      return Number(row?.count ?? 0);
    },

    async markRead(recipientId, ids, now) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.recipientId, recipientId),
            inArray(notifications.id, [...ids]),
            isNull(notifications.readAt),
          ),
        );
    },

    async markAllRead(recipientId, now) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.recipientId, recipientId),
            isNull(notifications.readAt),
            lte(notifications.createdAt, now),
          ),
        );
    },
  };
}
