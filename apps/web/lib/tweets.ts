"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { ApiError } from "./api-client";
import { sessionCsrfToken, useApiClient } from "./session";
import {
  assembleTimeline,
  dedupeTweets,
  restoreTweet,
  tweetSlot,
  type TweetSlot,
} from "./timeline-feed";

import type { InfiniteData } from "@tanstack/react-query";
import type {
  CreateTweetRequest,
  TimelinePage,
  Tweet,
} from "@twitter-clone/contracts";

/** The signed-in member a tweet action acts for. */
export interface TweetAuthorRef {
  id: string;
  username: string;
}

export const THREAD_KEY = ["thread"] as const;

const homeTimelineKey = (memberId: string) =>
  ["timeline", "home", memberId] as const;

/**
 * Tweets published in this visit, newest first. They stay out of web storage.
 * The timeline pages remain the keyset; this list only fills what those pages
 * do not show yet.
 */
const pendingKey = (memberId: string) =>
  ["timeline", "pending", memberId] as const;

const profileKey = (username: string) => ["profile", username.toLowerCase()];

export function usePendingTweets(memberId: string) {
  return useQuery({
    initialData: [] as Tweet[],
    queryFn: () => [] as Tweet[],
    queryKey: pendingKey(memberId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Home timeline pages. The cursor stays inside the query cache. */
export function useHomeTimeline(memberId: string) {
  const apiClient = useApiClient();
  return useInfiniteQuery({
    getNextPageParam: (page: TimelinePage) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => apiClient.getTimeline(pageParam),
    queryKey: homeTimelineKey(memberId),
  });
}

/** Tweets on screen, including this visit's posts that sort above page one. */
export function useTimelineItems(memberId: string) {
  const pending = usePendingTweets(memberId);
  const timeline = useHomeTimeline(memberId);
  return assembleTimeline(pending.data, timeline.data?.pages, true);
}

/**
 * Publishes a tweet. Not optimistic: the canonical card joins the timeline as
 * soon as the API confirms it, with no artificial wait (AC-B01.5). The
 * composer shows its own pending state meanwhile (AC-B01.4).
 */
export function useCreateTweet(member: TweetAuthorRef, parentTweetId?: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTweetRequest) =>
      parentTweetId === undefined
        ? apiClient.createTweet(input, sessionCsrfToken(queryClient))
        : apiClient.createReply(
            parentTweetId,
            input,
            sessionCsrfToken(queryClient),
          ),
    onSuccess: ({ tweet }) => {
      if (parentTweetId === undefined) {
        queryClient.setQueryData<Tweet[]>(
          pendingKey(member.id),
          (pending = []) => dedupeTweets([tweet, ...pending]),
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: THREAD_KEY });
        void queryClient.invalidateQueries({
          queryKey: homeTimelineKey(member.id),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: profileKey(member.username),
      });
    },
  });
}

interface PageSlot {
  index: number;
  slot: TweetSlot;
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
  const pending = pendingKey(member.id);
  const timeline = homeTimelineKey(member.id);
  return useMutation({
    mutationFn: (tweetId: string) =>
      apiClient.deleteTweet(tweetId, sessionCsrfToken(queryClient)),
    onMutate: async (tweetId) => {
      await queryClient.cancelQueries({ queryKey: pending });
      await queryClient.cancelQueries({ queryKey: timeline });
      const pendingTweets = queryClient.getQueryData<Tweet[]>(pending) ?? [];
      const pages =
        queryClient.getQueryData<InfiniteData<TimelinePage>>(timeline);
      const pendingSlot = tweetSlot(pendingTweets, tweetId);
      const pageIndex =
        pages?.pages.findIndex((page) =>
          page.items.some((tweet) => tweet.id === tweetId),
        ) ?? -1;
      const pageSlot: PageSlot | undefined =
        pages === undefined || pageIndex < 0
          ? undefined
          : {
              index: pageIndex,
              slot: tweetSlot(
                pages.pages[pageIndex]?.items ?? [],
                tweetId,
              ) as TweetSlot,
            };

      if (pendingSlot !== undefined) {
        queryClient.setQueryData<Tweet[]>(
          pending,
          pendingTweets.filter((tweet) => tweet.id !== tweetId),
        );
      }
      if (pages !== undefined && pageSlot !== undefined) {
        queryClient.setQueryData<InfiniteData<TimelinePage>>(timeline, {
          ...pages,
          pages: pages.pages.map((page) => ({
            ...page,
            items: page.items.filter((tweet) => tweet.id !== tweetId),
          })),
        });
      }
      if (pendingSlot === undefined && pageSlot === undefined) {
        return undefined;
      }
      return { pageSlot, pendingSlot };
    },
    onError: (error, _tweetId, context) => {
      if (error instanceof ApiError && error.code === "NOT_FOUND") {
        return;
      }
      if (context === undefined) {
        return;
      }
      if (context.pendingSlot !== undefined) {
        queryClient.setQueryData<Tweet[]>(pending, (current = []) =>
          restoreTweet(current, context.pendingSlot as TweetSlot),
        );
      }
      if (context.pageSlot !== undefined) {
        queryClient.setQueryData<InfiniteData<TimelinePage>>(
          timeline,
          (current) => {
            if (current === undefined) {
              return current;
            }
            const { index, slot } = context.pageSlot as PageSlot;
            return {
              ...current,
              pages: current.pages.map((page, pageIndex) =>
                pageIndex === index
                  ? { ...page, items: restoreTweet(page.items, slot) }
                  : page,
              ),
            };
          },
        );
      }
    },
    onSettled: (_result, error) => {
      if (error && !(error instanceof ApiError && error.code === "NOT_FOUND")) {
        return;
      }
      // Descendant replies can belong to other authors. Re-read their counts
      // and any previously loaded subtree or home page after a cascade.
      void queryClient.invalidateQueries({ queryKey: THREAD_KEY });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: timeline });
    },
  });
}
