import type { UserSearcher } from "./ports.js";
import type { UserSearchResponse } from "@twitter-clone/contracts";

export interface SearchUsersInput {
  /** Validated search text (2–50 characters, trimmed). */
  text: string;
  /** The signed-in member; search requires a session. */
  viewerId: string;
  limit: number;
}

export type SearchUsers = (
  input: SearchUsersInput,
) => Promise<UserSearchResponse>;

/**
 * People search (US-D01). Matching is case-insensitive, so the text is
 * lowercased once here; the repository treats it as literal characters.
 * Results contain public fields only (AC-D01.3).
 */
export function createSearchUsers(searcher: UserSearcher): SearchUsers {
  return async ({ limit, text, viewerId }) => {
    const rows = await searcher.search({
      limit,
      text: text.toLowerCase(),
      viewerId,
    });
    return {
      items: rows.map((row) => ({
        followedByViewer: row.followedByViewer,
        isViewer: row.id === viewerId,
        user: {
          avatarUrl: null,
          displayName: row.displayName,
          id: row.id,
          username: row.username,
        },
      })),
    };
  };
}
