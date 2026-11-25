import { notificationDedupeKey } from "../../src/modules/notifications/infrastructure/record-notification.js";
import { demoUserId } from "../demo-data.js";

import type { World } from "./plan.js";
import type { Sql } from "postgres";

/** Recent top-level demo posts the simulator can reply to. */
const RECENT_DEMO_POSTS = 30;
/**
 * Recent tweets by real members, replies included, read separately so the
 * simulator's own volume never pushes them out of reach.
 */
const RECENT_REAL_TWEETS = 20;
/** How many members can be mentioned; newest first so new local accounts show up. */
const MENTIONABLE_MEMBERS = 200;

/** A like the simulator added, so reset can take it back. */
export interface SimulatedLike {
  userId: string;
  tweetId: string;
}

/** Seeded accounts only: a real member who picked a `demo_` name is never acted as. */
async function demoAccounts(sql: Sql) {
  const rows = await sql<{ id: string; username: string }[]>`
    select id, username from users
    where deleted_at is null and username ~ '^demo_[0-9]+$'
    order by username`;
  return rows.filter((row) => row.id === demoUserId(row.username));
}

interface TweetRow {
  id: string;
  authorId: string;
  content: string;
}

/** Reads what the next action can see. Read-only. */
export async function readWorld(sql: Sql): Promise<World> {
  const actors = await demoAccounts(sql);
  const actorIds = actors.map((actor) => actor.id);
  // `in ()` is invalid SQL; an ID no account has stands in when nothing is seeded.
  const demoIds = actorIds.length > 0 ? actorIds : [demoUserId("")];
  const [members, demoPosts, realTweets] = await Promise.all([
    sql<{ id: string; username: string }[]>`
      select id, username from users where deleted_at is null
      order by created_at desc, id desc limit ${MENTIONABLE_MEMBERS}`,
    sql<TweetRow[]>`
      select id, author_id as "authorId", content from tweets
      where parent_tweet_id is null and author_id in ${sql(demoIds)}
      order by created_at desc, id desc limit ${RECENT_DEMO_POSTS}`,
    sql<TweetRow[]>`
      select id, author_id as "authorId", content from tweets
      where author_id not in ${sql(demoIds)}
      order by created_at desc, id desc limit ${RECENT_REAL_TWEETS}`,
  ]);
  return {
    actors: actors.map(({ id, username }) => ({ id, username })),
    members: members.map(({ id, username }) => ({ id, username })),
    recent: [...realTweets, ...demoPosts].map(({ authorId, content, id }) => ({
      authorId,
      content,
      id,
    })),
  };
}

/**
 * Undoes what the simulator recorded. A tweet is removed only while a seeded
 * account wrote it, and a like only while a seeded account gave it, so a
 * stale or edited list cannot touch a real member's own activity. Replies,
 * likes and notifications on removed tweets go by cascade; a removed like
 * takes its notification with it. Image bytes stay on disk but are no longer
 * served.
 *
 * @returns How many tweets and likes were removed directly.
 */
export async function resetActivity(
  sql: Sql,
  recorded: { tweetIds: readonly string[]; likes: readonly SimulatedLike[] },
): Promise<{ tweets: number; likes: number }> {
  const actorIds = new Set((await demoAccounts(sql)).map((actor) => actor.id));
  const likes = recorded.likes.filter((like) => actorIds.has(like.userId));
  if (actorIds.size === 0) {
    return { likes: 0, tweets: 0 };
  }
  return sql.begin(async (tx) => {
    let removedLikes = 0;
    for (const like of likes) {
      const removed = await tx`
        delete from likes
        where user_id = ${like.userId} and tweet_id = ${like.tweetId}`;
      removedLikes += removed.count;
      await tx`
        delete from notifications where dedupe_key = ${notificationDedupeKey({
          actorId: like.userId,
          recipientId: like.userId,
          tweetId: like.tweetId,
          type: "like",
        })}`;
    }
    const removedTweets =
      recorded.tweetIds.length === 0
        ? { count: 0 }
        : await tx`
            delete from tweets
            where id in ${tx(recorded.tweetIds)}
              and author_id in ${tx([...actorIds])}`;
    return { likes: removedLikes, tweets: removedTweets.count };
  });
}
