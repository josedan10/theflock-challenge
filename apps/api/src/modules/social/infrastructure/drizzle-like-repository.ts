import { and, eq, sql } from "drizzle-orm";

import {
  type Database,
  type DatabaseExecutor,
} from "../../../platform/database/client.js";
import { tweets } from "../../tweets/infrastructure/tweets.schema.js";
import { LikeTargetNotFoundError } from "../domain/errors.js";

import { likes } from "./social.schema.js";

import type {
  LikeRepository,
  LikeState,
  LikeWrite,
  UnlikeWrite,
} from "../application/ports.js";

const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Maps a failed like write onto a domain error.
 *
 * The tweet row is share-locked first, so only a member disappearing
 * mid-command reaches the foreign key. It still becomes a `404`, never a 500
 * or a leaked constraint name.
 */
export function interpretLikePersistenceError(error: unknown): never {
  for (
    let current: unknown = error;
    current instanceof Error;
    current = current.cause
  ) {
    if ((current as { code?: unknown }).code === FOREIGN_KEY_VIOLATION) {
      throw new LikeTargetNotFoundError();
    }
  }
  throw error;
}

async function requireTweet(
  db: DatabaseExecutor,
  tweetId: string,
): Promise<void> {
  // Share lock: a concurrent delete waits until this command commits, so the
  // like and the count refer to a tweet that still exists. Likers do not block
  // each other.
  const [row] = await db
    .select({ id: tweets.id })
    .from(tweets)
    .where(eq(tweets.id, tweetId))
    .limit(1)
    .for("share");
  if (row === undefined) {
    throw new LikeTargetNotFoundError();
  }
}

async function likeCount(
  db: DatabaseExecutor,
  tweetId: string,
): Promise<number> {
  const [row] = await db
    .select({ likeCount: sql<number>`cast(count(*) as integer)` })
    .from(likes)
    .where(eq(likes.tweetId, tweetId));
  return Number(row?.likeCount ?? 0);
}

/**
 * Likes against PostgreSQL. The primary key owns uniqueness and the count is
 * always read from rows, never kept as a counter that could drift (AC-C02.4).
 */
export function createDrizzleLikeRepository(db: Database): LikeRepository {
  return {
    async like(input: LikeWrite): Promise<LikeState> {
      return db.transaction(async (tx) => {
        await requireTweet(tx, input.tweetId);
        try {
          await tx
            .insert(likes)
            .values({
              createdAt: input.now,
              tweetId: input.tweetId,
              userId: input.memberId,
            })
            .onConflictDoNothing({ target: [likes.userId, likes.tweetId] });
        } catch (error: unknown) {
          interpretLikePersistenceError(error);
        }
        return {
          likeCount: await likeCount(tx, input.tweetId),
          liked: true,
          tweetId: input.tweetId,
        };
      });
    },

    async unlike(input: UnlikeWrite): Promise<LikeState> {
      return db.transaction(async (tx) => {
        await requireTweet(tx, input.tweetId);
        await tx
          .delete(likes)
          .where(
            and(
              eq(likes.userId, input.memberId),
              eq(likes.tweetId, input.tweetId),
            ),
          );
        return {
          likeCount: await likeCount(tx, input.tweetId),
          liked: false,
          tweetId: input.tweetId,
        };
      });
    },
  };
}
