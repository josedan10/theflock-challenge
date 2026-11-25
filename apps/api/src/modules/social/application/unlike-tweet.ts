import type { LikeRepository, LikeState } from "./ports.js";

export interface UnlikeTweetDependencies {
  likes: LikeRepository;
}

export interface UnlikeTweetInput {
  /** The authenticated member. Never taken from the request body. */
  memberId: string;
  /** A syntactically valid tweet id; the route rejects malformed ids. */
  tweetId: string;
}

export type UnlikeTweet = (input: UnlikeTweetInput) => Promise<LikeState>;

/**
 * Unlikes a tweet idempotently (US-C02, AC-C02.1).
 *
 * @throws {LikeTargetNotFoundError} When the tweet does not exist. An existing
 * tweet the member has not liked is a successful no-op, not this error.
 */
export function createUnlikeTweet(
  dependencies: UnlikeTweetDependencies,
): UnlikeTweet {
  return async ({ memberId, tweetId }) =>
    dependencies.likes.unlike({ memberId, tweetId });
}
