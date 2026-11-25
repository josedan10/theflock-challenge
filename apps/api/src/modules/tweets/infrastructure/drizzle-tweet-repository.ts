import { and, eq, isNull, sql } from "drizzle-orm";

import { users } from "../../auth/infrastructure/auth.schema.js";
import { TweetNotFoundError } from "../domain/errors.js";

import { tweets } from "./tweets.schema.js";

import type {
  Database,
  Transaction,
} from "../../../platform/database/client.js";
import type { TweetCard, TweetRepository } from "../application/ports.js";

/** Acquire the immutable conversation root before any child lock. This lets
 * replies run concurrently but prevents opposite lock orders between a cascade
 * walking down a tree and a reply indexing edges back up that same tree. */
async function lockConversation(
  tx: Transaction,
  id: string,
  mode: "reply" | "delete",
) {
  await tx.execute(sql`select root.id from tweets root
    where root.parent_tweet_id is null and root.id in
    (select ancestor_id from tweet_descendants where descendant_id=${id}::uuid union all select ${id}::uuid)
    ${mode === "reply" ? sql`for key share` : sql`for update`}`);
}

/** Tweets against PostgreSQL; deleting a tweet cascades its likes. */
export function createDrizzleTweetRepository(db: Database): TweetRepository {
  return {
    async create(tweet): Promise<TweetCard> {
      return db.transaction(async (tx) => {
        if (tweet.parentTweetId !== undefined) {
          // The same transaction verifies visibility and locks parent and author
          // against deletion until the new reply and its ancestor index commit.
          await lockConversation(tx, tweet.parentTweetId, "reply");
          const [parent] = await tx
            .select({ id: tweets.id })
            .from(tweets)
            .innerJoin(users, eq(users.id, tweets.authorId))
            .where(
              and(eq(tweets.id, tweet.parentTweetId), isNull(users.deletedAt)),
            )
            .for("share");
          if (parent === undefined) {
            throw new TweetNotFoundError();
          }
        }
        const [created] = await tx
          .insert(tweets)
          .values({
            authorId: tweet.authorId,
            content: tweet.content,
            createdAt: tweet.now,
            id: tweet.id,
            parentTweetId: tweet.parentTweetId ?? null,
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
          // Nor any replies.
          replyCount: 0,
        };
      });
    },

    async deleteOwned(tweetId, authorId) {
      return db.transaction(async (tx) => {
        await lockConversation(tx, tweetId, "delete");
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
