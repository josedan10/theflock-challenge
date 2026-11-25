import { ProfileNotFoundError } from "../domain/errors.js";
import { canonicalPublicUsername } from "../domain/username.js";

import type {
  KeysetPosition,
  SignedKeysetCursor,
} from "../../../platform/pagination/signed-keyset-cursor.js";
import type { ProfilePost } from "@twitter-clone/contracts";

/** One committed post, newest-keyset order, already shaped as a card. */
export interface ProfilePostRow extends ProfilePost {
  createdAt: string;
}

export interface ProfilePostsReader {
  /** `null` when the username names no visible member. */
  findMemberId(username: string): Promise<string | null>;
  /**
   * That member's tweets and replies, newest first. `count` includes the
   * lookahead row. `before` is exclusive.
   */
  readPage(input: {
    authorId: string;
    viewerId: string | null;
    before: KeysetPosition | null;
    count: number;
  }): Promise<ProfilePostRow[]>;
}

export interface ListProfilePostsDependencies {
  reader: ProfilePostsReader;
  cursors: SignedKeysetCursor;
}

export interface ListProfilePostsInput {
  /** Raw username from the path, not yet canonicalized. */
  username: string;
  /** The signed-in viewer, or `null` when signed out. */
  viewerId: string | null;
  limit: number;
  cursor?: string;
}

export type ListProfilePosts = (
  input: ListProfilePostsInput,
) => Promise<{ items: ProfilePost[]; nextCursor: string | null }>;

/**
 * One page of a member's tweets and replies (PROFILE-03, AC-A03.4).
 *
 * The cursor is scoped to the member, not the viewer, because the list is
 * public: a cursor from another profile fails before any read. Deleted rows
 * are absent because the reader only sees committed tweets.
 *
 * @throws {ProfileNotFoundError} When the username names no visible member.
 * @throws {InvalidKeysetCursorError} When the cursor is not valid for this member.
 */
export function createListProfilePosts(
  dependencies: ListProfilePostsDependencies,
): ListProfilePosts {
  return async ({ cursor, limit, username, viewerId }) => {
    const canonical = canonicalPublicUsername(username);
    const authorId =
      canonical === null
        ? null
        : await dependencies.reader.findMemberId(canonical);
    if (authorId === null) {
      throw new ProfileNotFoundError();
    }
    const before =
      cursor === undefined
        ? null
        : dependencies.cursors.decode(authorId, cursor);
    const rows = await dependencies.reader.readPage({
      authorId,
      before,
      count: limit + 1,
      viewerId,
    });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > limit && last !== undefined
          ? dependencies.cursors.encode(authorId, {
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
    };
  };
}
