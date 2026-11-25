"use client";

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { sessionCsrfToken, useApiClient } from "./session";

import type {
  MarkReadRequest,
  NotificationPage,
  UnreadCountResponse,
} from "@twitter-clone/contracts";

/** How often the header badge re-reads the unread count. */
export const UNREAD_POLL_MS = 30_000;

const listKey = (memberId: string) => ["notifications", "list", memberId];
const countKey = (memberId: string) => ["notifications", "count", memberId];

/** Pages of the member's notifications. The cursor stays in the cache. */
export function useNotifications(memberId: string) {
  const apiClient = useApiClient();
  return useInfiniteQuery({
    getNextPageParam: (page: NotificationPage) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => apiClient.getNotifications(pageParam),
    queryKey: listKey(memberId),
  });
}

/**
 * The badge count, polled while the app is open and refreshed when the tab
 * regains focus. `null` member (signed out) never asks.
 */
export function useUnreadCount(memberId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    enabled: memberId !== null,
    queryFn: () => apiClient.getUnreadCount(),
    queryKey: countKey(memberId ?? "none"),
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

function markPages(
  pages: InfiniteData<NotificationPage> | undefined,
  request: MarkReadRequest,
  read: boolean,
): InfiniteData<NotificationPage> | undefined {
  if (pages === undefined) {
    return pages;
  }
  const targets = "ids" in request ? new Set(request.ids) : null;
  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        targets === null || targets.has(item.id) ? { ...item, read } : item,
      ),
    })),
  };
}

interface MarkReadContext {
  pages: InfiniteData<NotificationPage> | undefined;
  count: UnreadCountResponse | undefined;
}

/**
 * Marks ids or everything read. Items and the badge update at once, settle on
 * the committed count, and roll back if the request fails.
 */
export function useMarkNotificationsRead(memberId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: MarkReadRequest) =>
      apiClient.markNotificationsRead(request, sessionCsrfToken(queryClient)),
    onMutate: async (request): Promise<MarkReadContext> => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const pages = queryClient.getQueryData<InfiniteData<NotificationPage>>(
        listKey(memberId),
      );
      const count = queryClient.getQueryData<UnreadCountResponse>(
        countKey(memberId),
      );
      const newlyRead =
        pages?.pages
          .flatMap((page) => page.items)
          .filter(
            (item) =>
              !item.read && ("all" in request || request.ids.includes(item.id)),
          ).length ?? 0;
      queryClient.setQueryData(
        listKey(memberId),
        markPages(pages, request, true),
      );
      if (count !== undefined) {
        queryClient.setQueryData<UnreadCountResponse>(countKey(memberId), {
          unreadCount:
            "all" in request ? 0 : Math.max(0, count.unreadCount - newlyRead),
        });
      }
      return { count, pages };
    },
    onError: (_error, _request, context) => {
      queryClient.setQueryData(listKey(memberId), context?.pages);
      queryClient.setQueryData(countKey(memberId), context?.count);
    },
    onSuccess: (count) => {
      queryClient.setQueryData(countKey(memberId), count);
    },
  });
}
