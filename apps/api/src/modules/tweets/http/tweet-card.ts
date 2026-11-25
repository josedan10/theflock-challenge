import { mediaObjectUrl, type Tweet } from "@twitter-clone/contracts";

import type { TweetCard } from "../application/ports.js";

/**
 * Maps a stored tweet card onto the wire contract. Content is copied
 * unchanged: it is plain text that clients escape. `avatarUrl` stays `null`
 * until an avatar upload exists. Image URLs use the configured API origin,
 * never the request Host header.
 */
export function toTweet(card: TweetCard, mediaOrigin: string): Tweet {
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
    image:
      card.image === null
        ? null
        : {
            alt: card.image.alt,
            height: card.image.height,
            url: mediaObjectUrl(mediaOrigin, card.image.objectKey),
            width: card.image.width,
          },
    likeCount: card.likeCount,
    likedByViewer: card.likedByViewer,
    replyCount: card.replyCount,
  };
}
