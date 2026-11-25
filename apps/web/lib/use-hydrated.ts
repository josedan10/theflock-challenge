"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * `false` on the server and during hydration, `true` afterwards.
 *
 * The header can load the session before a page finishes hydrating, so a
 * page that reads the cached session would render member content where the
 * server rendered its skeleton, and React would discard the tree. Pages gate
 * session-dependent output on this so the first client render matches.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
