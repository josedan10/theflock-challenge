import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../../../platform/database/client.js";
import type {
  ReadTimelineRows,
  TimelinePosition,
} from "../application/read-timeline.js";

/**
 * One snapshot of the member's home page.
 *
 * `count` is the requested page size plus one. The extra row is only a
 * signal that another page exists; the caller does not return it.
 */
export function timelineQuery(
  viewer: string,
  before: TimelinePosition | null,
  count: number,
) {
  // First page has no lower bound. A continuation uses a strict tuple
  // comparison, so the anchor row is not repeated and an equal timestamp
  // still orders by tweet id. The timestamp stays text: a JavaScript Date
  // would drop the microseconds that identify the boundary.
  const boundary =
    before === null
      ? sql``
      : sql`and (t.created_at, t.id) < (${before.createdAt}::timestamptz, ${before.id}::uuid)`;
  return sql`
    with eligible(author_id) as (
      -- Own tweets need no follow row. UNION ALL does not hide a duplicate
      -- because a member cannot follow themselves, so the two sets are disjoint.
      select ${viewer}::uuid union all
      select following_id from follows where follower_id = ${viewer}::uuid
    ), page as (
      select posts.*, u.id as author_id, u.username, u.display_name
      from eligible e join users u on u.id = e.author_id and u.deleted_at is null
      -- One index seek per author, stopped after this page. A sparse feed
      -- does not scan tweets from anyone else. NULLS LAST matches
      -- tweets_author_id_created_at_id_idx.
      cross join lateral (
        select t.id, t.content, t.created_at from tweets t
        where t.author_id = e.author_id ${boundary}
        order by t.created_at desc nulls last, t.id desc nulls last limit ${count}
      ) posts
      -- Merge those per-author slices and keep a single page, including the
      -- one lookahead row.
      order by posts.created_at desc, posts.id desc limit ${count}
    )
    select p.id, p.content,
      -- Six fractional digits, so the next cursor names this exact row.
      to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      p.author_id, p.username, p.display_name, reactions.like_count, reactions.liked
    from page p cross join lateral (
      -- Counts and the viewer's like only for the bounded page, in the same
      -- snapshot. There is no later query per card.
      select count(*) as like_count, coalesce(bool_or(l.user_id = ${viewer}::uuid), false) as liked
      from likes l where l.tweet_id = p.id
    ) reactions
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
}

export function createReadTimelineRows(db: DatabaseExecutor): ReadTimelineRows {
  return async (viewer, before, count) => {
    const rows = await db.execute<TimelineRow>(
      timelineQuery(viewer, before, count),
    );
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.created_at,
      author: {
        id: r.author_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: null,
      },
      likeCount: Number(r.like_count),
      likedByViewer: r.liked,
    }));
  };
}
