import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "../../auth/infrastructure/auth.schema.js";
import { tweets } from "../../tweets/infrastructure/tweets.schema.js";

const timestamptz = (name: string) =>
  timestamp(name, { mode: "date", precision: 6, withTimezone: true });

/**
 * In-app notifications (NOT-01). One row per recipient-facing event, written
 * in the same transaction as the follow, like or reply that causes it.
 *
 * `dedupe_key` is unique, so repeating an action (re-like, re-follow, a retry)
 * never notifies twice. The checks repeat the application rules: nobody is
 * notified of their own action, and only follows have no tweet. Deleting a
 * member or the tweet removes its notifications.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 16 }).notNull(),
    tweetId: uuid("tweet_id").references(() => tweets.id, {
      onDelete: "cascade",
    }),
    dedupeKey: text("dedupe_key")
      .notNull()
      .unique("notifications_dedupe_key_key"),
    readAt: timestamptz("read_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "notifications_type_check",
      sql`${table.type} in ('follow', 'like', 'reply')`,
    ),
    check(
      "notifications_not_self_check",
      sql`${table.actorId} <> ${table.recipientId}`,
    ),
    check(
      "notifications_tweet_check",
      sql`(${table.type} = 'follow') = (${table.tweetId} is null)`,
    ),
    // A recipient's newest-first page.
    index("notifications_recipient_created_id_idx").on(
      table.recipientId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    // The unread badge counts only unread rows.
    index("notifications_recipient_unread_idx")
      .on(table.recipientId)
      .where(sql`${table.readAt} is null`),
  ],
);
