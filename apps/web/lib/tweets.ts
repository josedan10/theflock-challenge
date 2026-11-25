"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  TIMELINE_LIVE_EVENT,
  timelineLiveEventSchema,
} from "@twitter-clone/contracts";
import { useEffect, useState } from "react";

import { ApiError } from "./api-client";
import { openUndoWindow } from "./post-undo";
import { sessionCsrfToken, useApiClient } from "./session";
import {
  assembleTimeline,
  dedupeTweets,
  mergeLiveTweets,
  restoreTweet,
  tweetSlot,
  type TweetSlot,
} from "./timeline-feed";

import type { InfiniteData } from "@tanstack/react-query";
import type {
  CreateTweetRequest,
  ProfilePostsPage,
  ThreadItem,
  TimelineItem,
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

/**
 * Replies posted in this visit, newest first, so Undo can sit under the composer.
 * Not under `THREAD_KEY`: invalidating the thread would refetch this away.
 */
const freshReplyKey = (memberId: string, parentId: string) =>
  ["thread-fresh", memberId, parentId] as const;

/** Replies this member just posted on one tweet. Kept only in the query cache. */
export function useFreshReplies(
  memberId: string,
  parentId: string,
): ThreadItem[] {
  return (
    useQuery({
      initialData: [] as ThreadItem[],
      initialDataUpdatedAt: Date.now(),
      queryFn: () => [] as ThreadItem[],
      queryKey: freshReplyKey(memberId, parentId),
      staleTime: Number.POSITIVE_INFINITY,
    }).data ?? []
  );
}

function rememberFreshReply(
  queryClient: ReturnType<typeof useQueryClient>,
  memberId: string,
  parentId: string,
  tweet: Tweet,
): void {
  const item: ThreadItem = { ...tweet, parentTweetId: parentId };
  queryClient.setQueryData<ThreadItem[]>(
    freshReplyKey(memberId, parentId),
    (current = []) =>
      current.some((entry) => entry.id === item.id)
        ? current
        : [item, ...current],
  );
}

/** Drops a reply from the under-composer list after Undo or delete. */
export function forgetFreshReply(
  queryClient: ReturnType<typeof useQueryClient>,
  memberId: string,
  parentId: string,
  tweetId: string,
): void {
  queryClient.setQueryData<ThreadItem[]>(
    freshReplyKey(memberId, parentId),
    (current = []) =>
      current.some((entry) => entry.id === tweetId)
        ? current.filter((entry) => entry.id !== tweetId)
        : current,
  );
}

export function usePendingTweets(memberId: string) {
  return useQuery({
    initialData: [] as Tweet[],
    queryFn: () => [] as Tweet[],
    queryKey: pendingKey(memberId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Batch live ids before refetching the first timeline page. */
export const LIVE_TIMELINE_REFETCH_MS = 50;

function tweetIsKnown(
  tweetId: string,
  pending: readonly Tweet[],
  pages: InfiniteData<TimelinePage> | undefined,
): boolean {
  if (pending.some((tweet) => tweet.id === tweetId)) {
    return true;
  }
  return (
    pages?.pages.some((page) =>
      page.items.some((tweet) => tweet.id === tweetId),
    ) === true
  );
}

/**
 * Opens the home-timeline SSE stream and merges new eligible cards into the
 * pending list. Does not move focus (AC-F01.2). Duplicate ids are dropped
 * (AC-F01.3). EventSource reconnects with `Last-Event-ID` on its own.
 */
export function useTimelineLive(memberId: string, enabled: boolean): string {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") {
      return;
    }
    const source = new EventSource(apiClient.timelineStreamUrl(), {
      withCredentials: true,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const queued = new Set<string>();

    const flush = () => {
      timer = undefined;
      const ids = [...queued];
      queued.clear();
      const pending =
        queryClient.getQueryData<Tweet[]>(pendingKey(memberId)) ?? [];
      const pages = queryClient.getQueryData<InfiniteData<TimelinePage>>(
        homeTimelineKey(memberId),
      );
      const unseen = ids.filter((id) => !tweetIsKnown(id, pending, pages));
      if (unseen.length === 0) {
        return;
      }
      void apiClient.getTimeline().then((page) => {
        const latestPending =
          queryClient.getQueryData<Tweet[]>(pendingKey(memberId)) ?? [];
        const latestPages = queryClient.getQueryData<
          InfiniteData<TimelinePage>
        >(homeTimelineKey(memberId));
        const loaded = latestPages?.pages[0]?.items ?? [];
        const merged = mergeLiveTweets(latestPending, page.items, loaded);
        queryClient.setQueryData<Tweet[]>(pendingKey(memberId), merged);
        const added = merged.filter(
          (tweet) =>
            !latestPending.some((item) => item.id === tweet.id) &&
            !loaded.some((item) => item.id === tweet.id),
        ).length;
        if (added > 0) {
          setAnnouncement(
            added === 1 ? "1 new post" : `${String(added)} new posts`,
          );
        }
      });
    };

    const onTweet = (event: Event) => {
      if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(event.data) as unknown;
      } catch {
        return;
      }
      const parsed = timelineLiveEventSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      queued.add(parsed.data.tweetId);
      if (timer === undefined) {
        timer = setTimeout(flush, LIVE_TIMELINE_REFETCH_MS);
      }
    };
    source.addEventListener(TIMELINE_LIVE_EVENT, onTweet);

    return () => {
      source.removeEventListener(TIMELINE_LIVE_EVENT, onTweet);
      source.close();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [apiClient, enabled, memberId, queryClient]);

  return announcement;
}

/** A member's tweets and replies. The cursor stays inside the query cache. */
export function useProfilePosts(username: string, enabled: boolean) {
  const apiClient = useApiClient();
  return useInfiniteQuery({
    enabled,
    getNextPageParam: (page: ProfilePostsPage) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => apiClient.getProfilePosts(username, pageParam),
    queryKey: [...profileKey(username), "posts"],
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
      // Home posts and replies each get their own Undo window (AC-B01.6).
      openUndoWindow(queryClient, member.id, tweet.id);
      if (parentTweetId === undefined) {
        queryClient.setQueryData<Tweet[]>(
          pendingKey(member.id),
          (pending = []) => dedupeTweets([tweet, ...pending]),
        );
      } else {
        rememberFreshReply(queryClient, member.id, parentTweetId, tweet);
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
  slot: TweetSlot<TimelineItem>;
}

/** Drops one card from infinite-query pages. Leaves other cache values as-is. */
function withoutTweetPages<T>(data: T, tweetId: string): T {
  if (typeof data !== "object" || data === null || !("pages" in data)) {
    return data;
  }
  const record = data as { pages?: unknown };
  if (!Array.isArray(record.pages)) {
    return data;
  }
  let changed = false;
  const pages = record.pages.map((page) => {
    if (typeof page !== "object" || page === null || !("items" in page)) {
      return page;
    }
    const items = (page as { items?: unknown }).items;
    if (!Array.isArray(items)) {
      return page;
    }
    const next = items.filter(
      (item) =>
        !(
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          (item as { id: unknown }).id === tweetId
        ),
    );
    if (next.length === items.length) {
      return page;
    }
    changed = true;
    return { ...page, items: next };
  });
  return changed ? ({ ...record, pages } as T) : data;
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
      await queryClient.cancelQueries({ queryKey: ["profile"] });
      const profileSnapshots = queryClient.getQueriesData({
        queryKey: ["profile"],
      });
      queryClient.setQueriesData({ queryKey: ["profile"] }, (current) =>
        withoutTweetPages(current, tweetId),
      );
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
              ) as TweetSlot<TimelineItem>,
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
      return { pageSlot, pendingSlot, profileSnapshots };
    },
    onError: (error, _tweetId, context) => {
      if (error instanceof ApiError && error.code === "NOT_FOUND") {
        return;
      }
      if (context === undefined) {
        return;
      }
      for (const [queryKey, data] of context.profileSnapshots) {
        queryClient.setQueryData(queryKey, data);
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
