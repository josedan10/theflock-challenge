import type { LikeRepository, LikeState } from "./ports.js";

export interface LikeTweetDependencies {
  likes: LikeRepository;
  clock: () => Date;
}

export interface LikeTweetInput {
  /** The authenticated member. Never taken from the request body. */
  memberId: string;
  /** A syntactically valid tweet id; the route rejects malformed ids. */
  tweetId: string;
}

export type LikeTweet = (input: LikeTweetInput) => Promise<LikeState>;

/**
 * Likes a tweet idempotently (US-C02, AC-C02.1).
 *
 * @throws {LikeTargetNotFoundError} When the tweet does not exist.
 * @remarks A repeated like does not insert a second row or change `created_at`.
 */
export function createLikeTweet(
  dependencies: LikeTweetDependencies,
): LikeTweet {
  return async ({ memberId, tweetId }) =>
    dependencies.likes.like({
      memberId,
      now: dependencies.clock(),
      tweetId,
    });
}
