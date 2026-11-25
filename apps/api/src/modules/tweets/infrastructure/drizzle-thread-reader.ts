import { mediaObjectUrl } from "@twitter-clone/contracts";
import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../../../platform/database/client.js";
import type { KeysetPosition } from "../../../platform/pagination/signed-keyset-cursor.js";
import type { ThreadItem, TweetImage } from "@twitter-clone/contracts";

/** Index-keyset seek on descendants of any selected tweet; includes the selected card on each page in the same snapshot. */
export function threadQuery(
  root: string,
  viewer: string | null,
  after: KeysetPosition | null,
  count: number,
) {
  const boundary = after
    ? sql`and (d.created_at,d.descendant_id) > (${after.createdAt}::timestamptz,${after.id}::uuid)`
    : sql``;
  return sql`with selected as (
      select t.id from tweets t join users u on u.id=t.author_id and u.deleted_at is null where t.id=${root}::uuid
    ), entries as (
      select selected.id, true as selected from selected
      union all
      (select d.descendant_id,false from tweet_descendants d
       join tweets r on r.id=d.descendant_id join users a on a.id=r.author_id and a.deleted_at is null
       where d.ancestor_id=${root}::uuid and exists (select 1 from selected) ${boundary} order by d.created_at,d.descendant_id limit ${count})
    )
    select t.id, t.content, t.parent_tweet_id, u.id as author_id, u.username, u.display_name,
      to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      (select count(*) from likes where tweet_id=t.id) as like_count,
      exists(select 1 from likes where tweet_id=t.id and user_id=${viewer}::uuid) as liked,
      (select count(*) from tweets c where c.parent_tweet_id=t.id) as reply_count,
      m.object_key, m.alt_text, m.width, m.height
    from entries e join tweets t on t.id=e.id join users u on u.id=t.author_id
    left join tweet_media m on m.tweet_id=t.id
    order by e.selected desc,t.created_at,t.id`;
}

interface CardRow extends Record<string, unknown> {
  id: string;
  content: string;
  parent_tweet_id: string | null;
  author_id: string;
  username: string;
  display_name: string;
  created_at: string;
  like_count: string;
  liked: boolean;
  reply_count: string;
  object_key: string | null;
  alt_text: string | null;
  width: number | string | null;
  height: number | string | null;
}

function threadImage(row: CardRow, mediaOrigin: string): TweetImage | null {
  if (
    row.object_key === null ||
    row.alt_text === null ||
    row.width === null ||
    row.height === null
  ) {
    return null;
  }
  return {
    alt: row.alt_text,
    height: Number(row.height),
    url: mediaObjectUrl(mediaOrigin, row.object_key),
    width: Number(row.width),
  };
}

export function createThreadReader(db: DatabaseExecutor, mediaOrigin: string) {
  return async (
    root: string,
    viewer: string | null,
    after: KeysetPosition | null,
    count: number,
  ): Promise<ThreadItem[]> => {
    const rows = await db.execute<CardRow>(
      threadQuery(root, viewer, after, count),
    );
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      parentTweetId: r.parent_tweet_id,
      createdAt: r.created_at,
      author: {
        id: r.author_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: null,
      },
      image: threadImage(r, mediaOrigin),
      likedByViewer: r.liked,
      likeCount: Number(r.like_count),
      replyCount: Number(r.reply_count),
    }));
  };
}
