import { canonicalPublicUsername } from "../../users/domain/username.js";
import { FollowTargetNotFoundError } from "../domain/errors.js";

import type { FollowRelationship, FollowRepository } from "./ports.js";

export interface UnfollowMemberDependencies {
  follows: FollowRepository;
}

export interface UnfollowMemberInput {
  /** The authenticated member. Never taken from the request body. */
  followerId: string;
  /** Raw username from the path, not yet canonicalized. */
  username: string;
}

export type UnfollowMember = (
  input: UnfollowMemberInput,
) => Promise<FollowRelationship>;

/**
 * Unfollows a member idempotently (US-C01).
 *
 * @throws {FollowTargetNotFoundError} When the username cannot exist or names
 * no visible member. An existing member who is not followed is a successful
 * no-op, not this error.
 * @throws {SelfFollowError} When the member names themselves.
 */
export function createUnfollowMember(
  dependencies: UnfollowMemberDependencies,
): UnfollowMember {
  return async ({ followerId, username }) => {
    const canonical = canonicalPublicUsername(username);
    if (canonical === null) {
      throw new FollowTargetNotFoundError();
    }
    return dependencies.follows.unfollow({
      followerId,
      username: canonical,
    });
  };
}
