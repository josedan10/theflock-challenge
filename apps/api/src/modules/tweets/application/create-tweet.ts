import type { TweetCard, TweetRepository } from "./ports.js";

export interface CreateTweetDependencies {
  tweets: TweetRepository;
  clock: () => Date;
  generateId: () => string;
}

export interface CreateTweetInput {
  /** The authenticated member; never taken from the request body. */
  authorId: string;
  parentTweetId?: string;
  /** Contract-validated, trimmed content. */
  content: string;
}

export type CreateTweet = (input: CreateTweetInput) => Promise<TweetCard>;

/** Publishes a tweet for the authenticated member (US-B01). */
export function createCreateTweet(
  dependencies: CreateTweetDependencies,
): CreateTweet {
  return (input) =>
    dependencies.tweets.create({
      authorId: input.authorId,
      ...(input.parentTweetId === undefined
        ? {}
        : { parentTweetId: input.parentTweetId }),
      content: input.content,
      id: dependencies.generateId(),
      now: dependencies.clock(),
    });
}
