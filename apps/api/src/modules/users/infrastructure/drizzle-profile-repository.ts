import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

import { type DatabaseExecutor } from "../../../platform/database/client.js";
import { users } from "../../../platform/database/schema.js";

import type { ProfileRepository, PublicProfile } from "../application/ports.js";

const profileColumns = {
  bio: users.bio,
  createdAt: users.createdAt,
  displayName: users.displayName,
  followerCount: sql`(select count(*) from follows where following_id = "users"."id")`,
  followingCount: sql`(select count(*) from follows where follower_id = "users"."id")`,
  id: users.id,
  // Columns are qualified on purpose: inside the subquery an unqualified "id"
  // would bind to tweets.id. Served by tweets_author_id_created_at_id_idx.
  tweetCount: sql`(select count(*)::integer from "tweets" where "tweets"."author_id" = "users"."id")`,
  username: users.username,
};

/**
 * Profile counts use committed relation rows. Email, password hash, and avatar key are not selected.
 */
async function loadPublicProfile(
  db: DatabaseExecutor,
  where: SQL,
): Promise<PublicProfile | null> {
  const [row] = await db
    .select(profileColumns)
    .from(users)
    .where(where)
    .limit(1);
  if (row === undefined) {
    return null;
  }
  return {
    bio: row.bio,
    createdAt: row.createdAt,
    displayName: row.displayName,
    followerCount: Number(row.followerCount),
    followingCount: Number(row.followingCount),
    id: row.id,
    tweetCount: Number(row.tweetCount),
    username: row.username,
  };
}

function visibleUsername(username: string): SQL | undefined {
  return and(eq(users.username, username), isNull(users.deletedAt));
}

function visibleMember(userId: string): SQL | undefined {
  return and(eq(users.id, userId), isNull(users.deletedAt));
}

/** Profile reads and own-profile updates against the `users` table. */
export function createDrizzleProfileRepository(
  db: DatabaseExecutor,
): ProfileRepository {
  return {
    async findByUsername(username) {
      const where = visibleUsername(username);
      return where === undefined ? null : loadPublicProfile(db, where);
    },

    async update(userId, patch, now) {
      return db.transaction(async (tx) => {
        const where = visibleMember(userId);
        if (where === undefined) {
          return null;
        }
        const updated = await tx
          .update(users)
          .set({
            updatedAt: now,
            ...(patch.bio === undefined ? {} : { bio: patch.bio }),
            ...(patch.displayName === undefined
              ? {}
              : { displayName: patch.displayName }),
          })
          .where(where)
          .returning({ id: users.id });
        if (updated[0] === undefined) {
          return null;
        }
        return loadPublicProfile(tx, where);
      });
    },
  };
}
