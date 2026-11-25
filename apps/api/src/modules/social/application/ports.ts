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

/** Committed like state used to reconcile a like button. */
export interface LikeState {
  tweetId: string;
  liked: boolean;
  /** The tweet's like count from rows committed in this command. */
  likeCount: number;
}

export interface LikeWrite {
  memberId: string;
  tweetId: string;
  /** Clock instant for a newly inserted like. A repeat like keeps the original. */
  now: Date;
}

export interface UnlikeWrite {
  memberId: string;
  tweetId: string;
}

export interface LikeRepository {
  /**
   * Inserts the like when it is absent.
   *
   * The composite primary key makes a concurrent or repeated insert a no-op.
   * The returned count includes this command's row.
   *
   * @throws {LikeTargetNotFoundError} When the tweet does not exist.
   */
  like(input: LikeWrite): Promise<LikeState>;
  /**
   * Removes the like when it is present.
   *
   * A second unlike of the same pair leaves the count unchanged.
   *
   * @throws {LikeTargetNotFoundError} When the tweet does not exist.
   */
  unlike(input: UnlikeWrite): Promise<LikeState>;
}

/** Which side of a member's follow edges a list shows. */
export type FollowListDirection = "followers" | "following";

/** One listed member, positioned by when the edge was created. */
export interface FollowListEntry {
  /** Edge creation time at microsecond precision, as UTC text. */
  createdAt: string;
  id: string;
  username: string;
  displayName: string;
  /** Whether the viewer follows this member; `false` when signed out. */
  followedByViewer: boolean;
}

export interface FollowListReader {
  /** The visible member's id, or `null` for an unknown or soft-deleted one. */
  findMemberId(username: string): Promise<string | null>;
  /**
   * Up to `count` members newest edge first, strictly after `before`.
   * Soft-deleted members are skipped.
   */
  readPage(input: {
    direction: FollowListDirection;
    memberId: string;
    viewerId: string | null;
    before: { createdAt: string; id: string } | null;
    count: number;
  }): Promise<FollowListEntry[]>;
}
