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
 * and comes back in its original position if the request fails. A 404 means
 * it is already gone, so it stays removed.
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
      queryClient.setQueryData<Tweet[]>(
        key,
        previous.filter((tweet) => tweet.id !== tweetId),
      );
      return { previous };
    },
    onError: (error, _tweetId, context) => {
      if (error instanceof ApiError && error.code === "NOT_FOUND") {
        return;
      }
      if (context !== undefined) {
        queryClient.setQueryData<Tweet[]>(key, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: profileKey(member.username),
      });
    },
  });
}
