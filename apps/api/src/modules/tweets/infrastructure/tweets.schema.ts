import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  primaryKey,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "../../auth/infrastructure/auth.schema.js";

const timestamptz = (name: string) =>
  timestamp(name, { mode: "date", precision: 6, withTimezone: true });

/**
 * Short posts. The checks repeat the contract (non-blank, already trimmed,
 * at most 280 characters) so a bypassed caller cannot store an invalid post.
 * Authors cannot be deleted while they have tweets until an account-deletion
 * policy exists (database model).
 */
export const tweets = pgTable(
  "tweets",
  {
    id: uuid("id").primaryKey(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    parentTweetId: uuid("parent_tweet_id").references(
      (): AnyPgColumn => tweets.id,
      { onDelete: "cascade" },
    ),
    content: varchar("content", { length: 280 }).notNull(),
    createdAt: timestamptz("created_at").notNull(),
    // Reserved: editing is not a v1 feature.
    updatedAt: timestamptz("updated_at"),
  },
  (table) => [
    index("tweets_parent_tweet_id_idx")
      .on(table.parentTweetId)
      .where(sql`${table.parentTweetId} is not null`),
    check("tweets_not_own_parent", sql`${table.parentTweetId} <> ${table.id}`),
    // Profile pages: one author's tweets, newest first.
    index("tweets_author_id_created_at_id_idx").on(
      table.authorId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    // Timeline keyset order: created_at DESC, id DESC.
    index("tweets_created_at_id_idx").on(
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check(
      "tweets_content_not_blank_check",
      sql`char_length(btrim(${table.content})) > 0`,
    ),
    check(
      "tweets_content_trimmed_check",
      sql`${table.content} = btrim(${table.content}, E' \\t\\n\\r')`,
    ),
  ],
);

/** Indexed ancestry projection maintained by database triggers in the same transaction as a reply. */
export const tweetDescendants = pgTable(
  "tweet_descendants",
  {
    ancestorId: uuid("ancestor_id")
      .notNull()
      .references(() => tweets.id, { onDelete: "cascade" }),
    descendantId: uuid("descendant_id")
      .notNull()
      .references(() => tweets.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.descendantId, t.ancestorId] }),
    index("tweet_descendants_page_idx").on(
      t.ancestorId,
      t.createdAt,
      t.descendantId,
    ),
    check(
      "tweet_descendants_no_self",
      sql`${t.ancestorId} <> ${t.descendantId}`,
    ),
  ],
);
