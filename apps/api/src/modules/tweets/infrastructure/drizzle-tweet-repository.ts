import { eq } from "drizzle-orm";

import { users } from "../../auth/infrastructure/auth.schema.js";

import { tweets } from "./tweets.schema.js";

import type { Database } from "../../../platform/database/client.js";
import type { TweetCard, TweetRepository } from "../application/ports.js";

/** Tweets against PostgreSQL; deleting a tweet cascades its likes. */
export function createDrizzleTweetRepository(db: Database): TweetRepository {
  return {
    async create(tweet): Promise<TweetCard> {
      return db.transaction(async (tx) => {
        const [created] = await tx
          .insert(tweets)
          .values({
            authorId: tweet.authorId,
            content: tweet.content,
            createdAt: tweet.now,
            id: tweet.id,
          })
          .returning();
        const [author] = await tx
          .select({
            avatarKey: users.avatarKey,
            displayName: users.displayName,
            id: users.id,
            username: users.username,
          })
          .from(users)
          .where(eq(users.id, tweet.authorId));
        if (created === undefined || author === undefined) {
          throw new Error("Tweet insert returned no row");
        }
        return {
          author,
          content: created.content,
          createdAt: created.createdAt,
          id: created.id,
          // A tweet that was just created has no likes yet.
          likeCount: 0,
          likedByViewer: false,
        };
      });
    },

    async deleteOwned(tweetId, authorId) {
      return db.transaction(async (tx) => {
        // Lock the row so the ownership check and the delete see the same tweet.
        const [found] = await tx
          .select({ authorId: tweets.authorId })
          .from(tweets)
          .where(eq(tweets.id, tweetId))
          .for("update");
        if (found === undefined) {
          return "not-found";
        }
        if (found.authorId !== authorId) {
          return "not-author";
        }
        await tx.delete(tweets).where(eq(tweets.id, tweetId));
        return "deleted";
      });
    },
  };
}
