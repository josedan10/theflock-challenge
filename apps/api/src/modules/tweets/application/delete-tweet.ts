import { NotTweetAuthorError, TweetNotFoundError } from "../domain/errors.js";

import type { TweetRepository } from "./ports.js";

export interface DeleteTweetInput {
  tweetId: string;
  /** The authenticated member asking for the delete. */
  memberId: string;
}

export type DeleteTweet = (input: DeleteTweetInput) => Promise<void>;

/**
 * Deletes a member's own tweet (US-B02).
 *
 * @throws {TweetNotFoundError} When the tweet does not exist or was deleted.
 * @throws {NotTweetAuthorError} When someone else wrote it.
 */
export function createDeleteTweet(tweets: TweetRepository): DeleteTweet {
  return async ({ memberId, tweetId }) => {
    const outcome = await tweets.deleteOwned(tweetId, memberId);
    if (outcome === "not-found") {
      throw new TweetNotFoundError();
    }
    if (outcome === "not-author") {
      throw new NotTweetAuthorError();
    }
  };
}
