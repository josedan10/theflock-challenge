"use client";

import { type QueryClient, useQuery } from "@tanstack/react-query";

/** How long a new home post can be undone (AC-B01.6). */
export const UNDO_WINDOW_MS = 5_000;

/** Tweet id → time (ms since epoch) when its Undo goes away. */
export type UndoWindows = Readonly<Record<string, number>>;

const undoKey = (memberId: string) => ["post-undo", memberId] as const;

/**
 * Open undo windows for the member's posts from this visit. Kept in the
 * query cache, outside the timeline queries, so refetching the timeline
 * never resets a countdown. Never sent anywhere.
 */
export function useUndoWindows(memberId: string): UndoWindows {
  return useQuery({
    initialData: {} as UndoWindows,
    queryFn: () => ({}) as UndoWindows,
    queryKey: undoKey(memberId),
    staleTime: Number.POSITIVE_INFINITY,
  }).data;
}

/** Starts a fresh window for a just-created home post. */
export function openUndoWindow(
  queryClient: QueryClient,
  memberId: string,
  tweetId: string,
  now: number = Date.now(),
): void {
  queryClient.setQueryData<UndoWindows>(undoKey(memberId), (windows = {}) => ({
    ...windows,
    [tweetId]: now + UNDO_WINDOW_MS,
  }));
}

/** Ends one post's window: it expired, or the post was undone. */
export function closeUndoWindow(
  queryClient: QueryClient,
  memberId: string,
  tweetId: string,
): void {
  queryClient.setQueryData<UndoWindows>(undoKey(memberId), (windows = {}) => {
    if (!(tweetId in windows)) {
      return windows;
    }
    const { [tweetId]: _closed, ...rest } = windows;
    return rest;
  });
}

/** Ends every window; leaving the timeline does this (AC-B01.7). */
export function clearUndoWindows(
  queryClient: QueryClient,
  memberId: string,
): void {
  queryClient.setQueryData<UndoWindows>(undoKey(memberId), {});
}
