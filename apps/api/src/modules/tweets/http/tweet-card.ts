import type { TweetCard } from "../application/ports.js";
import type { Tweet } from "@twitter-clone/contracts";

/**
 * Maps a stored tweet card onto the wire contract. Content is copied
 * unchanged: it is plain text that clients escape. `avatarUrl` stays `null`
 * until an upload flow exists.
 */
export function toTweet(card: TweetCard): Tweet {
  return {
    author: {
      avatarUrl: null,
      displayName: card.author.displayName,
      id: card.author.id,
      username: card.author.username,
    },
    content: card.content,
    createdAt: card.createdAt.toISOString(),
    id: card.id,
    likeCount: card.likeCount,
    likedByViewer: card.likedByViewer,
  };
}
