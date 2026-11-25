import { canonicalPublicUsername } from "../../users/domain/username.js";
import { FollowTargetNotFoundError } from "../domain/errors.js";

import type { SignedKeysetCursor } from "../../../platform/pagination/signed-keyset-cursor.js";
import type { FollowListDirection, FollowListReader } from "./ports.js";
import type { FollowListPage } from "@twitter-clone/contracts";

export interface ListFollowsDependencies {
  reader: FollowListReader;
  cursors: SignedKeysetCursor;
}

export interface ListFollowsInput {
  direction: FollowListDirection;
  /** Raw username from the path, not yet canonicalized. */
  username: string;
  /** The signed-in viewer, or `null` when signed out. */
  viewerId: string | null;
  limit: number;
  cursor?: string;
}

export type ListFollows = (input: ListFollowsInput) => Promise<FollowListPage>;

/**
 * One page of a member's followers or following (US-C03, AC-C03.1).
 *
 * The cursor is scoped to the list (direction and member id), not the viewer,
 * because the lists are public: a cursor from one list fails on any other.
 * Each member appears once because the follow primary key allows one edge per
 * pair, and the strict keyset never repeats the anchor row.
 *
 * @throws {FollowTargetNotFoundError} When the username names no visible member.
 * @throws {InvalidKeysetCursorError} When the cursor is not valid for this list.
 */
export function createListFollows(
  dependencies: ListFollowsDependencies,
): ListFollows {
  return async ({ cursor, direction, limit, username, viewerId }) => {
    const canonical = canonicalPublicUsername(username);
    const memberId =
      canonical === null
        ? null
        : await dependencies.reader.findMemberId(canonical);
    if (memberId === null) {
      throw new FollowTargetNotFoundError();
    }
    const scope = `${direction}:${memberId}`;
    const before =
      cursor === undefined ? null : dependencies.cursors.decode(scope, cursor);
    const rows = await dependencies.reader.readPage({
      before,
      count: limit + 1,
      direction,
      memberId,
      viewerId,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        followedByViewer: row.followedByViewer,
        isViewer: row.id === viewerId,
        user: {
          avatarUrl: null,
          displayName: row.displayName,
          id: row.id,
          username: row.username,
        },
      })),
      nextCursor:
        rows.length > limit && last !== undefined
          ? dependencies.cursors.encode(scope, {
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
    };
  };
}
