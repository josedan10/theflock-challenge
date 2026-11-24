"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "./api-client";
import { sessionCsrfToken, useApiClient } from "./session";

import type { CreateTweetRequest, Tweet } from "@twitter-clone/contracts";

/** The signed-in member a tweet action acts for. */
export interface TweetAuthorRef {
  id: string;
  username: string;
}

/**
 * Tweets the member posted in this browser session, newest first. Nothing
 * lists tweets until the timeline exists (FEED-01), so this list lives only
 * in the query cache and is dropped by the full-page logout.
 */
const postedKey = (memberId: string) => ["tweets", "posted", memberId] as const;

const profileKey = (username: string) => ["profile", username.toLowerCase()];

export function usePostedTweets(memberId: string) {
  return useQuery({
    initialData: [] as Tweet[],
    queryFn: () => [] as Tweet[],
    queryKey: postedKey(memberId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Publishes a tweet. Not optimistic: the API returns the canonical card
 * (id, timestamp, counts), which is prepended once the request succeeds.
 */
export function useCreateTweet(member: TweetAuthorRef) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTweetRequest) =>
      apiClient.createTweet(input, sessionCsrfToken(queryClient)),
    onSuccess: ({ tweet }) => {
      queryClient.setQueryData<Tweet[]>(postedKey(member.id), (posted = []) => [
        tweet,
        ...posted,
      ]);
      void queryClient.invalidateQueries({
        queryKey: profileKey(member.username),
      });
    },
  });
}

/**
 * Deletes one of the member's tweets optimistically: it disappears at once,
 * and comes back in its original position if the request fails, without
 * undoing other deletes that succeeded meanwhile. A 404 means it is already
 * gone, so it stays removed.
 */
export function useDeleteTweet(member: TweetAuthorRef) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const key = postedKey(member.id);
  return useMutation({
    mutationFn: (tweetId: string) =>
      apiClient.deleteTweet(tweetId, sessionCsrfToken(queryClient)),
    onMutate: async (tweetId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Tweet[]>(key) ?? [];
      const index = previous.findIndex((tweet) => tweet.id === tweetId);
      queryClient.setQueryData<Tweet[]>(
        key,
        previous.filter((tweet) => tweet.id !== tweetId),
      );
      return index < 0
        ? undefined
        : {
            // Ids that were listed above it; anything not in `previous` was
            // posted later, so it belongs above it as well.
            above: new Set(previous.slice(0, index).map((tweet) => tweet.id)),
            known: new Set(previous.map((tweet) => tweet.id)),
            tweet: previous[index] as Tweet,
          };
    },
    onError: (error, _tweetId, context) => {
      if (error instanceof ApiError && error.code === "NOT_FOUND") {
        return;
      }
      if (context === undefined) {
        return;
      }
      // Re-insert only this tweet into the current list, so another delete
      // that succeeded meanwhile is not undone by an old snapshot.
      queryClient.setQueryData<Tweet[]>(key, (current = []) => {
        if (current.some((tweet) => tweet.id === context.tweet.id)) {
          return current;
        }
        let at = 0;
        current.forEach((tweet, position) => {
          if (context.above.has(tweet.id) || !context.known.has(tweet.id)) {
            at = position + 1;
          }
        });
        return [...current.slice(0, at), context.tweet, ...current.slice(at)];
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: profileKey(member.username),
      });
    },
  });
}
