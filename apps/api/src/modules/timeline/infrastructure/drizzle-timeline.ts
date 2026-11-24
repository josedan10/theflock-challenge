import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../../../platform/database/client.js";
import type {
  ReadTimelineRows,
  TimelinePosition,
} from "../application/read-timeline.js";

/**
 * The author index supplies at most one page per eligible author even for a
 * sparse feed. Only the final page gets like projections, in the same snapshot.
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
        select t.id, t.content, t.created_at from tweets t
        where t.author_id = e.author_id ${boundary}
        order by t.created_at desc nulls last, t.id desc nulls last limit ${count}
      ) posts
      order by posts.created_at desc, posts.id desc limit ${count}
    )
    select p.id, p.content,
      to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      p.author_id, p.username, p.display_name, reactions.like_count, reactions.liked
    from page p cross join lateral (
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
