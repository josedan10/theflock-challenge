import type { TweetCard, TweetRepository } from "./ports.js";

export interface CreateTweetDependencies {
  tweets: TweetRepository;
  clock: () => Date;
  generateId: () => string;
  /**
   * Notified after the tweet row commits. Failures here must not fail the
   * create: reconnect catch-up recovers a missed live fan-out.
   */
  onCreated?: (tweet: {
    id: string;
    authorId: string;
    createdAt: Date;
  }) => Promise<void> | void;
}

export interface CreateTweetInput {
  /** The authenticated member; never taken from the request body. */
  authorId: string;
  parentTweetId?: string;
  /** Contract-validated, trimmed content. */
  content: string;
  /** Verified upload owned by `authorId`, attached in the same transaction. */
  image?: { alt: string; uploadId: string };
}

export type CreateTweet = (input: CreateTweetInput) => Promise<TweetCard>;

/** Publishes a tweet for the authenticated member (US-B01). */
export function createCreateTweet(
  dependencies: CreateTweetDependencies,
): CreateTweet {
  return async (input) => {
    const card = await dependencies.tweets.create({
      authorId: input.authorId,
      ...(input.parentTweetId === undefined
        ? {}
        : { parentTweetId: input.parentTweetId }),
      content: input.content,
      id: dependencies.generateId(),
      ...(input.image === undefined ? {} : { image: input.image }),
      now: dependencies.clock(),
    });
    try {
      await dependencies.onCreated?.({
        authorId: card.author.id,
        createdAt: card.createdAt,
        id: card.id,
      });
    } catch {
      // Live fan-out must not hide a committed tweet (LIVE-01).
    }
    return card;
  };
}
