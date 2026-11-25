"use client";

import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { sessionCsrfToken, useApiClient } from "./session";
import { THREAD_KEY } from "./tweets";

import type { LikeResponse, Tweet } from "@twitter-clone/contracts";

type LikeFields = Pick<Tweet, "likeCount" | "likedByViewer">;

/** Cache roots that hold tweet cards: home pages, pending posts, threads, profiles. */
const TWEET_CACHE_ROOTS = [["timeline"], THREAD_KEY, ["profile"]] as const;

function isTweet(value: unknown): value is Tweet {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "likeCount" in value
  );
}

/**
 * Returns `value` with every card for `tweetId` patched. It understands the
 * cached shapes holding cards: a card list, a page with `items` (and a
 * thread's `selected`), and infinite data with `pages`. Anything else is
 * returned unchanged, so unrelated queries are never rewritten.
 */
export function patchTweetCards<Value>(
  value: Value,
  tweetId: string,
  patch: LikeFields,
): Value {
  if (Array.isArray(value)) {
    return value.map((item: unknown) =>
      isTweet(item) && item.id === tweetId ? { ...item, ...patch } : item,
    ) as Value;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.pages)) {
    return {
      ...record,
      pages: record.pages.map((page: unknown) =>
        patchTweetCards(page, tweetId, patch),
      ),
    } as Value;
  }
  if (Array.isArray(record.items)) {
    const selected = record.selected;
    return {
      ...record,
      items: patchTweetCards(record.items, tweetId, patch),
      ...(isTweet(selected) && selected.id === tweetId
        ? { selected: { ...selected, ...patch } }
        : {}),
    } as Value;
  }
  return value;
}

function setLikeEverywhere(
  queryClient: QueryClient,
  tweetId: string,
  patch: LikeFields,
): void {
  for (const queryKey of TWEET_CACHE_ROOTS) {
    queryClient.setQueriesData({ queryKey }, (data: unknown) =>
      patchTweetCards(data, tweetId, patch),
    );
  }
}

export interface LikeInput {
  like: boolean;
  /** The card's state when clicked, restored if the API rejects the change. */
  previous: LikeFields;
}

/**
 * Likes or unlikes one tweet optimistically (AC-C02.2): every cached card
 * for it changes at once, settles on the committed count from the API, and
 * rolls back if the request fails.
 */
export function useLikeTweet(tweetId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ like }: LikeInput): Promise<LikeResponse> => {
      const csrfToken = sessionCsrfToken(queryClient);
      return like
        ? apiClient.like(tweetId, csrfToken)
        : apiClient.unlike(tweetId, csrfToken);
    },
    onMutate: async ({ like, previous }) => {
      await Promise.all(
        TWEET_CACHE_ROOTS.map((queryKey) =>
          queryClient.cancelQueries({ queryKey }),
        ),
      );
      setLikeEverywhere(queryClient, tweetId, {
        likeCount: Math.max(0, previous.likeCount + (like ? 1 : -1)),
        likedByViewer: like,
      });
    },
    onError: (_error, { previous }) => {
      setLikeEverywhere(queryClient, tweetId, previous);
    },
    onSuccess: ({ like }) => {
      setLikeEverywhere(queryClient, tweetId, {
        likeCount: like.likeCount,
        likedByViewer: like.liked,
      });
    },
  });
}
