import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "../../auth/infrastructure/auth.schema.js";
import { tweets } from "../../tweets/infrastructure/tweets.schema.js";

const createdAt = () =>
  timestamp("created_at", { precision: 6, withTimezone: true })
    .notNull()
    .defaultNow();

/** Directed membership; a member's own posts need no follow row. */
export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: uuid("following_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    check("follows_no_self_check", sql`${t.followerId} <> ${t.followingId}`),
    index("follows_following_created_follower_idx").on(
      t.followingId,
      t.createdAt.desc(),
      t.followerId,
    ),
    index("follows_follower_created_following_idx").on(
      t.followerId,
      t.createdAt.desc(),
      t.followingId,
    ),
  ],
);

/** One like per viewer/tweet pair, removed atomically when the tweet is deleted. */
export const likes = pgTable(
  "likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tweetId: uuid("tweet_id")
      .notNull()
      .references(() => tweets.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tweetId] }),
    index("likes_tweet_created_user_idx").on(
      t.tweetId,
      t.createdAt.desc(),
      t.userId,
    ),
  ],
);
