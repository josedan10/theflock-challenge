import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../../../platform/database/client.js";
import type { UserSearcher } from "../application/ports.js";

/**
 * Escapes LIKE metacharacters so search text is matched literally
 * (AC-D01.4). The backslash is escaped first, then `%` and `_`; the query
 * names `\` as the escape character explicitly.
 */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Case-insensitive literal substring search over username and display name.
 *
 * Ranking (AC-D01.2): exact username, then username prefix, then display
 * name prefix, then any other substring; ties order by the unique username,
 * so results are deterministic. Usernames are stored lowercase and display
 * names are compared through lower(), matching the trigram indexes. Text is
 * always a bound parameter; only the escaped pattern reaches LIKE.
 * Soft-deleted members never match.
 */
export function userSearchQuery(input: {
  text: string;
  viewerId: string;
  limit: number;
}) {
  const escaped = escapeLikePattern(input.text);
  const prefix = `${escaped}%`;
  const contains = `%${escaped}%`;
  return sql`
    select u.id, u.username, u.display_name,
      exists (select 1 from follows f
        where f.follower_id = ${input.viewerId}::uuid and f.following_id = u.id
      ) as followed_by_viewer
    from users u
    where u.deleted_at is null
      and (u.username like ${contains} escape '\\'
        or lower(u.display_name) like ${contains} escape '\\')
    order by
      case
        when u.username = ${input.text} then 0
        when u.username like ${prefix} escape '\\' then 1
        when lower(u.display_name) like ${prefix} escape '\\' then 2
        else 3
      end,
      u.username
    limit ${input.limit}`;
}

interface UserSearchRow extends Record<string, unknown> {
  id: string;
  username: string;
  display_name: string;
  followed_by_viewer: boolean;
}

/** People search against PostgreSQL. */
export function createDrizzleUserSearcher(db: DatabaseExecutor): UserSearcher {
  return {
    async search(input) {
      const rows = await db.execute<UserSearchRow>(userSearchQuery(input));
      return rows.map((row) => ({
        displayName: row.display_name,
        followedByViewer: row.followed_by_viewer,
        id: row.id,
        username: row.username,
      }));
    },
  };
}
