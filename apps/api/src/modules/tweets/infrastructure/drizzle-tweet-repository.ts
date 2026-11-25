import { and, eq, isNull, sql } from "drizzle-orm";

import { users } from "../../auth/infrastructure/auth.schema.js";
import { ImageUnavailableError } from "../../media/domain/image-policy.js";
import { claimVerifiedUpload } from "../../media/infrastructure/drizzle-media-repository.js";
import { tweetMedia } from "../../media/infrastructure/media.schema.js";
import { recordNotification } from "../../notifications/infrastructure/record-notification.js";
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
        let parentAuthorId: string | null = null;
        if (tweet.parentTweetId !== undefined) {
          // The same transaction verifies visibility and locks parent and author
          // against deletion until the new reply and its ancestor index commit.
          await lockConversation(tx, tweet.parentTweetId, "reply");
          const [parent] = await tx
            .select({ authorId: tweets.authorId })
            .from(tweets)
            .innerJoin(users, eq(users.id, tweets.authorId))
            .where(
              and(eq(tweets.id, tweet.parentTweetId), isNull(users.deletedAt)),
            )
            .for("share");
          if (parent === undefined) {
            throw new TweetNotFoundError();
          }
          parentAuthorId = parent.authorId;
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
        if (parentAuthorId !== null) {
          // The parent's author hears about the reply when it commits.
          await recordNotification(
            tx,
            {
              actorId: tweet.authorId,
              recipientId: parentAuthorId,
              tweetId: created.id,
              type: "reply",
            },
            tweet.now,
          );
        }
        const image =
          tweet.image === undefined
            ? null
            : await claimVerifiedUpload(tx, {
                alt: tweet.image.alt,
                now: tweet.now,
                ownerId: tweet.authorId,
                tweetId: created.id,
                uploadId: tweet.image.uploadId,
              });
        if (tweet.image !== undefined && image === null) {
          throw new ImageUnavailableError();
        }
        return {
          author,
          content: created.content,
          createdAt: created.createdAt,
          id: created.id,
          image,
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
          return { objectKeys: [], outcome: "not-found" };
        }
        if (found.authorId !== authorId) {
          return { objectKeys: [], outcome: "not-author" };
        }
        const media = await tx
          .select({ objectKey: tweetMedia.objectKey })
          .from(tweetMedia)
          .where(
            sql`${tweetMedia.tweetId} = ${tweetId}::uuid or ${tweetMedia.tweetId} in (
              select descendant_id from tweet_descendants where ancestor_id = ${tweetId}::uuid
            )`,
          );
        await tx.delete(tweets).where(eq(tweets.id, tweetId));
        return {
          objectKeys: media.map((row) => row.objectKey),
          outcome: "deleted",
        };
      });
    },
  };
}
