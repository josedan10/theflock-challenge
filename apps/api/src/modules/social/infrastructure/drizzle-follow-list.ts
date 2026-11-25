import { and, eq, isNull, sql } from "drizzle-orm";

import { users } from "../../auth/infrastructure/auth.schema.js";

import type { DatabaseExecutor } from "../../../platform/database/client.js";
import type {
  FollowListDirection,
  FollowListEntry,
  FollowListReader,
} from "../application/ports.js";

/**
 * Fixed column names per direction. They never come from the request.
 *
 * `followers` of a member are edges pointing at them, read through
 * `follows_following_created_follower_idx`. `following` are edges they own,
 * read through `follows_follower_created_following_idx`.
 */
const columns: Record<FollowListDirection, { owner: string; listed: string }> =
  {
    followers: { listed: "follower_id", owner: "following_id" },
    following: { listed: "following_id", owner: "follower_id" },
  };

/**
 * One page of a follow list, newest edge first.
 *
 * Ties on `created_at` order by the listed member id ascending, which is the
 * order of the composite index, so the page is an index range scan. The
 * continuation is strictly after the anchor `(created_at, id)`: the anchor is
 * not repeated and each member appears once. The timestamp stays text so a
 * JavaScript Date cannot drop the microseconds. Soft-deleted members are
 * skipped by the join. `followed_by_viewer` is a primary-key probe per row on
 * this bounded page; it is `false` when signed out.
 */
export function followListQuery(input: {
  direction: FollowListDirection;
  memberId: string;
  viewerId: string | null;
  before: { createdAt: string; id: string } | null;
  count: number;
}) {
  const { listed, owner } = columns[input.direction];
  const listedColumn = sql.raw(`f.${listed}`);
  const ownerColumn = sql.raw(`f.${owner}`);
  const boundary =
    input.before === null
      ? sql``
      : sql`and (f.created_at < ${input.before.createdAt}::timestamptz
          or (f.created_at = ${input.before.createdAt}::timestamptz
            and ${listedColumn} > ${input.before.id}::uuid))`;
  const followedByViewer =
    input.viewerId === null
      ? sql`false`
      : sql`exists (select 1 from follows v
          where v.follower_id = ${input.viewerId}::uuid and v.following_id = u.id)`;
  return sql`
    select u.id, u.username, u.display_name,
      to_char(f.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      ${followedByViewer} as followed_by_viewer
    from follows f
    join users u on u.id = ${listedColumn} and u.deleted_at is null
    where ${ownerColumn} = ${input.memberId}::uuid ${boundary}
    order by f.created_at desc, ${listedColumn} asc
    limit ${input.count}`;
}

interface FollowListRow extends Record<string, unknown> {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
  followed_by_viewer: boolean;
}

/** Follow lists against PostgreSQL. */
export function createDrizzleFollowListReader(
  db: DatabaseExecutor,
): FollowListReader {
  return {
    async findMemberId(username) {
      const where = and(eq(users.username, username), isNull(users.deletedAt));
      if (where === undefined) {
        return null;
      }
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(where)
        .limit(1);
      return row?.id ?? null;
    },
    async readPage(input): Promise<FollowListEntry[]> {
      const rows = await db.execute<FollowListRow>(followListQuery(input));
      return rows.map((row) => ({
        createdAt: row.created_at,
        displayName: row.display_name,
        followedByViewer: row.followed_by_viewer,
        id: row.id,
        username: row.username,
      }));
    },
  };
}
