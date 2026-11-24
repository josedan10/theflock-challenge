/**
 * Raised when a tweet does not exist, including one already deleted. The HTTP
 * layer answers `404` (AC-B02.2).
 */
export class TweetNotFoundError extends Error {
  override readonly name = "TweetNotFoundError";

  constructor() {
    super("That tweet does not exist.");
  }
}

/**
 * Raised when an authenticated member tries to delete someone else's tweet.
 * The HTTP layer answers `403` (AC-B02.2).
 */
export class NotTweetAuthorError extends Error {
  override readonly name = "NotTweetAuthorError";

  constructor() {
    super("Only the author can delete this tweet.");
  }
}
