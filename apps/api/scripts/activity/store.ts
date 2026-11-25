import { demoUserId } from "../demo-data.js";

import type { World } from "./plan.js";
import type { Sql } from "postgres";

/** How far back the simulator looks for something to reply to. */
const RECENT_POSTS = 50;
/** How many members can be mentioned; newest first so new local accounts show up. */
const MENTIONABLE_MEMBERS = 200;

/** Seeded accounts only: a real member who picked a `demo_` name is never acted as. */
async function demoAccounts(sql: Sql) {
  const rows = await sql<{ id: string; username: string }[]>`
    select id, username from users
    where deleted_at is null and username ~ '^demo_[0-9]+$'
    order by username`;
  return rows.filter((row) => row.id === demoUserId(row.username));
}

/** Reads what the next action can see. Read-only. */
export async function readWorld(sql: Sql): Promise<World> {
  const [actors, members, recent] = await Promise.all([
    demoAccounts(sql),
    sql<{ id: string; username: string }[]>`
      select id, username from users where deleted_at is null
      order by created_at desc, id desc limit ${MENTIONABLE_MEMBERS}`,
    sql<{ id: string; authorId: string; content: string }[]>`
      select id, author_id as "authorId", content from tweets
      where parent_tweet_id is null
      order by created_at desc, id desc limit ${RECENT_POSTS}`,
  ]);
  return {
    actors: actors.map(({ id, username }) => ({ id, username })),
    members: members.map(({ id, username }) => ({ id, username })),
    recent: recent.map(({ authorId, content, id }) => ({
      authorId,
      content,
      id,
    })),
  };
}

/**
 * Deletes what the simulator wrote: tweets by seeded accounts that the API
 * created (UUIDv7), not the seed's fixed rows (UUIDv5). Replies, likes and
 * notifications on them go with them by cascade. Real members' own posts stay.
 * Image bytes stay on disk but are no longer served once the tweet is gone.
 *
 * @returns The number of top-level tweets and replies removed directly.
 */
export async function resetActivity(sql: Sql): Promise<number> {
  const actors = await demoAccounts(sql);
  if (actors.length === 0) {
    return 0;
  }
  const removed = await sql`
    delete from tweets
    where author_id in ${sql(actors.map((actor) => actor.id))}
      and substring(id::text from 15 for 1) = '7'`;
  return removed.count;
}
