import { canonicalPublicUsername } from "../../users/domain/username.js";
import { FollowTargetNotFoundError } from "../domain/errors.js";

import type { FollowRelationship, FollowRepository } from "./ports.js";

export interface FollowMemberDependencies {
  follows: FollowRepository;
  clock: () => Date;
}

export interface FollowMemberInput {
  /** The authenticated member. Never taken from the request body. */
  followerId: string;
  /** Raw username from the path, not yet canonicalized. */
  username: string;
}

export type FollowMember = (
  input: FollowMemberInput,
) => Promise<FollowRelationship>;

/**
 * Follows another member idempotently (US-C01).
 *
 * @throws {FollowTargetNotFoundError} When the username cannot exist or names
 * no visible member.
 * @throws {SelfFollowError} When the member names themselves.
 * @remarks A repeated follow does not insert a second row or change `created_at`.
 */
export function createFollowMember(
  dependencies: FollowMemberDependencies,
): FollowMember {
  return async ({ followerId, username }) => {
    const canonical = canonicalPublicUsername(username);
    if (canonical === null) {
      throw new FollowTargetNotFoundError();
    }
    return dependencies.follows.follow({
      followerId,
      now: dependencies.clock(),
      username: canonical,
    });
  };
}
