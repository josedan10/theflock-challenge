import { mediaObjectUrl, type TweetImage } from "@twitter-clone/contracts";
import { and, eq, isNull, sql } from "drizzle-orm";

import { users } from "../../../platform/database/schema.js";

import type { DatabaseExecutor } from "../../../platform/database/client.js";
import type { KeysetPosition } from "../../../platform/pagination/signed-keyset-cursor.js";
import type {
  ProfilePostRow,
  ProfilePostsReader,
} from "../application/list-profile-posts.js";

/**
 * One author's tweets and replies, newest first.
 *
 * `tweets_author_id_created_at_id_idx` is `(author_id, created_at DESC NULLS
 * LAST, id DESC NULLS LAST)`. The order matches that index. A continuation
 * uses a strict `(created_at, id)` comparison so the anchor is not repeated
 * and equal timestamps still order by id. The timestamp stays text so a
 * JavaScript Date cannot drop the microseconds.
 *
 * Replies are included: there is no `parent_tweet_id is null` filter. A reply
 * names its parent author only while that member is visible. Like counts and
 * the viewer's like are projected for this page only. `count` includes the
 * lookahead row.
 */
export function profilePostsQuery(
  authorId: string,
  viewerId: string | null,
  before: KeysetPosition | null,
  count: number,
) {
  const boundary =
    before === null
      ? sql``
      : sql`and (t.created_at, t.id) < (${before.createdAt}::timestamptz, ${before.id}::uuid)`;
  return sql`
    select t.id, t.content,
      to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      u.id as author_id, u.username, u.display_name,
      parent_user.username as replying_to,
      (select count(*) from likes l where l.tweet_id = t.id) as like_count,
      exists(
        select 1 from likes l
        where l.tweet_id = t.id and l.user_id = ${viewerId}::uuid
      ) as liked,
      (select count(*) from tweets c where c.parent_tweet_id = t.id) as reply_count,
      m.object_key, m.alt_text, m.width, m.height
    from tweets t
    join users u on u.id = t.author_id and u.deleted_at is null
    left join tweets parent on parent.id = t.parent_tweet_id
    left join users parent_user
      on parent_user.id = parent.author_id and parent_user.deleted_at is null
    left join tweet_media m on m.tweet_id = t.id
    where t.author_id = ${authorId}::uuid ${boundary}
    order by t.created_at desc nulls last, t.id desc nulls last
    limit ${count}`;
}

interface ProfilePostSqlRow extends Record<string, unknown> {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  username: string;
  display_name: string;
  replying_to: string | null;
  like_count: string;
  liked: boolean;
  reply_count: string;
  object_key: string | null;
  alt_text: string | null;
  width: number | string | null;
  height: number | string | null;
}

function mapImage(
  row: ProfilePostSqlRow,
  mediaOrigin: string,
): TweetImage | null {
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

/** Profile post reads against `tweets`, scoped to one visible author. */
export function createDrizzleProfilePostsReader(
  db: DatabaseExecutor,
  mediaOrigin: string,
): ProfilePostsReader {
  return {
    async findMemberId(username) {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.username, username), isNull(users.deletedAt)))
        .limit(1);
      return row?.id ?? null;
    },
    async readPage({ authorId, before, count, viewerId }) {
      const result = await db.execute<ProfilePostSqlRow>(
        profilePostsQuery(authorId, viewerId, before, count),
      );
      return result.map((row) => mapRow(row, mediaOrigin));
    },
  };
}

function mapRow(row: ProfilePostSqlRow, mediaOrigin: string): ProfilePostRow {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    author: {
      id: row.author_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: null,
    },
    image: mapImage(row, mediaOrigin),
    likeCount: Number(row.like_count),
    likedByViewer: row.liked,
    replyCount: Number(row.reply_count),
    replyingTo: row.replying_to,
  };
}
