"use client";

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { sessionCsrfToken, useApiClient } from "./session";

import type { FollowListDirection } from "./api-client";
import type {
  FollowListPage,
  FollowResponse,
  PublicProfileResponse,
} from "@twitter-clone/contracts";

/** Every cached follow list, for invalidation after a follow change. */
const followListsKey = ["follow-list"] as const;

export const followListKey = (
  username: string,
  direction: FollowListDirection,
) => [...followListsKey, direction, username.toLowerCase()] as const;

const profileKey = (username: string) => ["profile", username.toLowerCase()];

/** Pages of a member's followers or following. The cursor stays in the cache. */
export function useFollowList(
  username: string,
  direction: FollowListDirection,
) {
  const apiClient = useApiClient();
  return useInfiniteQuery({
    getNextPageParam: (page: FollowListPage) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiClient.getFollowList(username, direction, pageParam),
    queryKey: followListKey(username, direction),
  });
}

/** Sets the viewer's relationship to `username` on every cached list row. */
function markFollowed(
  pages: InfiniteData<FollowListPage> | undefined,
  username: string,
  following: boolean,
): InfiniteData<FollowListPage> | undefined {
  if (pages === undefined) {
    return pages;
  }
  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.user.username === username
          ? { ...item, followedByViewer: following }
          : item,
      ),
    })),
  };
}

export interface FollowTarget {
  username: string;
  /** The signed-in member, whose following count changes too. */
  viewerUsername: string;
}

/**
 * Follows or unfollows a member optimistically (AC-C01.4): every cached list
 * row for them flips at once and flips back if the API rejects the change.
 * The target's follower count is then taken from the committed response, and
 * the viewer's profile, the lists and the home timeline are refetched, since
 * following changes which tweets the timeline may show (AC-C01.3).
 */
export function useFollowMember({ username, viewerUsername }: FollowTarget) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (follow: boolean): Promise<FollowResponse> => {
      const csrfToken = sessionCsrfToken(queryClient);
      return follow
        ? apiClient.follow(username, csrfToken)
        : apiClient.unfollow(username, csrfToken);
    },
    onMutate: async (follow) => {
      await queryClient.cancelQueries({ queryKey: followListsKey });
      queryClient.setQueriesData<InfiniteData<FollowListPage>>(
        { queryKey: followListsKey },
        (pages) => markFollowed(pages, username, follow),
      );
    },
    onError: (_error, follow) => {
      queryClient.setQueriesData<InfiniteData<FollowListPage>>(
        { queryKey: followListsKey },
        (pages) => markFollowed(pages, username, !follow),
      );
    },
    onSuccess: ({ relationship }) => {
      queryClient.setQueryData<PublicProfileResponse>(
        profileKey(username),
        (current) =>
          current === undefined
            ? current
            : {
                profile: {
                  ...current.profile,
                  followerCount: relationship.followerCount,
                },
              },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: followListsKey });
      void queryClient.invalidateQueries({
        queryKey: profileKey(viewerUsername),
      });
      void queryClient.invalidateQueries({ queryKey: ["timeline", "home"] });
    },
  });
}
