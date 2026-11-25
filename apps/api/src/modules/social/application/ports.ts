/** Committed relationship used to reconcile a follow button. */
export interface FollowRelationship {
  /** Target member. Logged by the route and omitted from the HTTP body. */
  targetId: string;
  following: boolean;
  /** Target's follower count from rows committed in this command. */
  followerCount: number;
}

export interface FollowWrite {
  followerId: string;
  /** Stored lowercase username of the target. */
  username: string;
  /** Clock instant for a newly inserted edge. A repeat follow keeps the original. */
  now: Date;
}

export interface UnfollowWrite {
  followerId: string;
  /** Stored lowercase username of the target. */
  username: string;
}

export interface FollowRepository {
  /**
   * Inserts the follow edge when it is absent.
   *
   * The composite primary key makes a concurrent or repeated insert a no-op.
   * The returned count includes this command's row.
   *
   * @throws {FollowTargetNotFoundError} When the username names no visible member.
   * @throws {SelfFollowError} When the member names themselves.
   */
  follow(input: FollowWrite): Promise<FollowRelationship>;
  /**
   * Removes the follow edge when it is present.
   *
   * A second unfollow of the same pair leaves the count unchanged.
   *
   * @throws {FollowTargetNotFoundError} When the username names no visible member.
   * @throws {SelfFollowError} When the member names themselves.
   */
  unfollow(input: UnfollowWrite): Promise<FollowRelationship>;
}
