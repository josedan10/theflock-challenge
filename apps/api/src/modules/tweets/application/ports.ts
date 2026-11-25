/** Outcome of an ownership-checked delete, decided inside one transaction. */
export interface DeleteTweetResult {
  objectKeys: readonly string[];
  outcome: "deleted" | "not-author" | "not-found";
}

export interface TweetImageRecord {
  alt: string;
  height: number;
  objectKey: string;
  width: number;
}

/** Values needed to store a tweet; content must already satisfy the contract. */
export interface NewTweet {
  id: string;
  authorId: string;
  parentTweetId?: string;
  content: string;
  now: Date;
  /** Verified upload to attach in the same transaction (US-F02). */
  image?: { alt: string; uploadId: string };
}

/** Public author fields shown on a card; email and credentials stay out. */
export interface TweetAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
}

/** Tweet card read model, as committed. */
export interface TweetCard {
  id: string;
  content: string;
  createdAt: Date;
  author: TweetAuthor;
  likeCount: number;
  likedByViewer: boolean;
  /** Direct replies to this tweet. */
  replyCount: number;
  image: TweetImageRecord | null;
}

/** Outcome of an ownership-checked delete, decided inside one transaction. */
export type DeleteTweetOutcome = DeleteTweetResult;

export interface TweetRepository {
  /** Stores the tweet and returns its card with the author's public fields. */
  create(tweet: NewTweet): Promise<TweetCard>;
  /**
   * Deletes the tweet only when `authorId` wrote it. The ownership check and
   * the delete run in one transaction, so a concurrent delete cannot succeed
   * twice (architecture: consistency and concurrency).
   */
  deleteOwned(tweetId: string, authorId: string): Promise<DeleteTweetOutcome>;
}
