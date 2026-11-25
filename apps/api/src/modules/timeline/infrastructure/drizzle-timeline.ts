import { mediaObjectUrl, type TweetImage } from "@twitter-clone/contracts";
import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../../../platform/database/client.js";
import type { ReadTimelineSinceRows } from "../application/read-timeline-since.js";
import type {
  ReadTimelineRows,
  TimelineEntry,
  TimelinePosition,
} from "../application/read-timeline.js";

/**
 * One snapshot of the member's home page. `count` is the page size plus one;
 * the extra row only signals that another page exists.
 *
 * `eligible` is the member plus the accounts they follow. `UNION ALL` is safe
 * because a member cannot follow themselves, so the two sets are disjoint.
 * Deleted authors are dropped by the join on `users`.
 *
 * The lateral seek reads at most one page per author from
 * `tweets_author_id_created_at_id_idx` (`NULLS LAST` matches that index), so a
 * sparse feed does not scan anyone else. `boundary` is empty on the first
 * page. A continuation uses a strict `(created_at, id)` comparison: the anchor
 * row is not repeated, equal timestamps still order by tweet id, and the
 * timestamp stays text so a JavaScript Date cannot drop the microseconds.
 *
 * Those per-author slices are merged and capped at `count`, including the
 * lookahead row. The selected timestamp keeps six fractional digits so the
 * next cursor names that exact row. Like counts, the viewer's like and direct
 * reply counts (via `tweets_parent_tweet_id_idx`) are projected only for
 * this bounded page, in the same snapshot.
 */
export function timelineQuery(
  viewer: string,
  before: TimelinePosition | null,
  count: number,
) {
  const boundary =
    before === null
      ? sql``
      : sql`and (t.created_at, t.id) < (${before.createdAt}::timestamptz, ${before.id}::uuid)`;
  return sql`
    with eligible(author_id) as (
      select ${viewer}::uuid union all
      select following_id from follows where follower_id = ${viewer}::uuid
    ), page as (
      select posts.*, u.id as author_id, u.username, u.display_name
      from eligible e join users u on u.id = e.author_id and u.deleted_at is null
      cross join lateral (
        select t.id, t.content, t.created_at, t.parent_tweet_id from tweets t
        where t.author_id = e.author_id ${boundary}
        order by t.created_at desc nulls last, t.id desc nulls last limit ${count}
      ) posts
      order by posts.created_at desc, posts.id desc limit ${count}
    )
    select p.id, p.content,
      to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      p.author_id, p.username, p.display_name, reactions.like_count, reactions.liked,
      (select count(*) from tweets c where c.parent_tweet_id = p.id) as reply_count,
      parent.id as parent_id, parent.content as parent_content, parent_user.username as parent_username,
      m.object_key, m.alt_text, m.width, m.height
    from page p cross join lateral (
      select count(*) as like_count, coalesce(bool_or(l.user_id = ${viewer}::uuid), false) as liked
      from likes l where l.tweet_id = p.id
    ) reactions
    left join tweets parent on parent.id = p.parent_tweet_id
    left join users parent_user
      on parent_user.id = parent.author_id and parent_user.deleted_at is null
    left join tweet_media m on m.tweet_id = p.id
    order by p.created_at desc, p.id desc`;
}

interface TimelineRow extends Record<string, unknown> {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  username: string;
  display_name: string;
  like_count: string;
  liked: boolean;
  reply_count: string;
  parent_id: string | null;
  parent_content: string | null;
  parent_username: string | null;
  object_key: string | null;
  alt_text: string | null;
  width: number | string | null;
  height: number | string | null;
}

export function createReadTimelineRows(
  db: DatabaseExecutor,
  mediaOrigin: string,
): ReadTimelineRows {
  return async (viewer, before, count) => {
    const rows = await db.execute<TimelineRow>(
      timelineQuery(viewer, before, count),
    );
    return rows.map((row) => mapTimelineRow(row, mediaOrigin));
  };
}

/**
 * Same eligible authors and indexes as {@link timelineQuery}, but the boundary
 * is exclusive *newer* than `after` so a reconnect can catch up (AC-F01.3).
 */
export function timelineSinceQuery(
  viewer: string,
  after: TimelinePosition,
  count: number,
) {
  const boundary = sql`and (t.created_at, t.id) > (${after.createdAt}::timestamptz, ${after.id}::uuid)`;
  return sql`
    with eligible(author_id) as (
      select ${viewer}::uuid union all
      select following_id from follows where follower_id = ${viewer}::uuid
    ), page as (
      select posts.*, u.id as author_id, u.username, u.display_name
      from eligible e join users u on u.id = e.author_id and u.deleted_at is null
      cross join lateral (
        select t.id, t.content, t.created_at, t.parent_tweet_id from tweets t
        where t.author_id = e.author_id ${boundary}
        order by t.created_at desc nulls last, t.id desc nulls last limit ${count}
      ) posts
      order by posts.created_at desc, posts.id desc limit ${count}
    )
    select p.id, p.content,
      to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      p.author_id, p.username, p.display_name, reactions.like_count, reactions.liked,
      (select count(*) from tweets c where c.parent_tweet_id = p.id) as reply_count,
      parent.id as parent_id, parent.content as parent_content, parent_user.username as parent_username,
      m.object_key, m.alt_text, m.width, m.height
    from page p cross join lateral (
      select count(*) as like_count, coalesce(bool_or(l.user_id = ${viewer}::uuid), false) as liked
      from likes l where l.tweet_id = p.id
    ) reactions
    left join tweets parent on parent.id = p.parent_tweet_id
    left join users parent_user
      on parent_user.id = parent.author_id and parent_user.deleted_at is null
    left join tweet_media m on m.tweet_id = p.id
    order by p.created_at desc, p.id desc`;
}

export function createReadTimelineSinceRows(
  db: DatabaseExecutor,
  mediaOrigin: string,
): ReadTimelineSinceRows {
  return async (viewer, after, count) => {
    const rows = await db.execute<TimelineRow>(
      timelineSinceQuery(viewer, after, count),
    );
    return rows.map((row) => mapTimelineRow(row, mediaOrigin));
  };
}

/** The author plus current followers: who may hear this tweet on a live stream. */
export function createListTimelineRecipients(db: DatabaseExecutor) {
  return async (authorId: string): Promise<string[]> => {
    const rows = await db.execute<{ id: string }>(sql`
      select ${authorId}::uuid as id
      union
      select follower_id as id from follows where following_id = ${authorId}::uuid`);
    return rows.map((row) => row.id);
  };
}

function mapImage(row: TimelineRow, mediaOrigin: string): TweetImage | null {
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

function mapTimelineRow(r: TimelineRow, mediaOrigin: string): TimelineEntry {
  return {
    id: r.id,
    content: r.content,
    createdAt: r.created_at,
    author: {
      id: r.author_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: null,
    },
    image: mapImage(r, mediaOrigin),
    likeCount: Number(r.like_count),
    likedByViewer: r.liked,
    replyCount: Number(r.reply_count),
    replyingTo:
      r.parent_id === null || r.parent_content === null
        ? null
        : {
            content: r.parent_content,
            id: r.parent_id,
            username: r.parent_username,
          },
  };
}
