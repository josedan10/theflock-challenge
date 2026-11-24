import type { Tweet } from "@twitter-clone/contracts";

/**
 * Timeline order is `createdAt DESC, id DESC`. ISO timestamps from one API
 * sort lexicographically; the id breaks ties the same way the keyset does.
 */
function isNewer(candidate: Tweet, boundary: Tweet): boolean {
  if (candidate.createdAt !== boundary.createdAt) {
    return candidate.createdAt > boundary.createdAt;
  }
  return candidate.id > boundary.id;
}

/** First occurrence wins, so a later page cannot repeat a tweet already shown. */
export function dedupeTweets(tweets: readonly Tweet[]): Tweet[] {
  const seen = new Set<string>();
  const unique: Tweet[] = [];
  for (const tweet of tweets) {
    if (seen.has(tweet.id)) {
      continue;
    }
    seen.add(tweet.id);
    unique.push(tweet);
  }
  return unique;
}

export function tweetsInPages(
  pages: readonly { items: readonly Tweet[] }[],
): Tweet[] {
  return dedupeTweets(pages.flatMap((page) => page.items));
}

/**
 * Tweets posted in this visit that belong above the loaded page.
 *
 * The home timeline is a keyset. Tweets already returned, and tweets older
 * than the newest loaded row, stay behind `nextCursor`. Prepending those
 * would skip the cursor and show the next page before the member asks for it.
 * An empty first page has no boundary yet, so every unseen pending tweet is
 * still ahead (the usual case after the member's own successful post).
 */
export function tweetsAheadOfPage(
  pending: readonly Tweet[],
  firstPage: readonly Tweet[],
): Tweet[] {
  const loaded = new Set(firstPage.map((tweet) => tweet.id));
  const newest = firstPage[0];
  return dedupeTweets(pending).filter((tweet) => {
    if (loaded.has(tweet.id)) {
      return false;
    }
    return newest === undefined || isNewer(tweet, newest);
  });
}

/**
 * The list the member sees. `showAhead` is false once they have asked for an
 * older page: newer posts then wait on the banner instead of jumping the list.
 */
export function assembleTimeline(
  pending: readonly Tweet[],
  pages: readonly { items: readonly Tweet[] }[] | undefined,
  showAhead: boolean,
): Tweet[] {
  const loaded = pages ?? [];
  const ahead = showAhead
    ? tweetsAheadOfPage(pending, loaded[0]?.items ?? [])
    : [];
  return dedupeTweets([...ahead, ...tweetsInPages(loaded)]);
}

/**
 * Enough to put a tweet back where it was. `above` are the ids that were
 * newer than it; `known` are the ids in that list when it was removed, so a
 * tweet posted later (not in `known`) stays newer than the restored one.
 */
export interface TweetSlot {
  above: ReadonlySet<string>;
  known: ReadonlySet<string>;
  tweet: Tweet;
}

export function tweetSlot(
  tweets: readonly Tweet[],
  tweetId: string,
): TweetSlot | undefined {
  const index = tweets.findIndex((tweet) => tweet.id === tweetId);
  if (index < 0) {
    return undefined;
  }
  return {
    above: new Set(tweets.slice(0, index).map((tweet) => tweet.id)),
    known: new Set(tweets.map((tweet) => tweet.id)),
    tweet: tweets[index] as Tweet,
  };
}

/** Inserts `slot.tweet` unless that id is already present. */
export function restoreTweet(
  tweets: readonly Tweet[],
  slot: TweetSlot,
): Tweet[] {
  if (tweets.some((tweet) => tweet.id === slot.tweet.id)) {
    return [...tweets];
  }
  let at = 0;
  tweets.forEach((tweet, position) => {
    if (slot.above.has(tweet.id) || !slot.known.has(tweet.id)) {
      at = position + 1;
    }
  });
  return [...tweets.slice(0, at), slot.tweet, ...tweets.slice(at)];
}
