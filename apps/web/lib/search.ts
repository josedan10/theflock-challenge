"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  codePointLength,
  USER_SEARCH_MAX_LENGTH,
  USER_SEARCH_MIN_LENGTH,
} from "@twitter-clone/contracts";
import { useEffect, useState } from "react";

import { useApiClient } from "./session";

/** Typing pause before a search request is sent. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Root of every cached people search, for follow updates. */
export const userSearchKey = ["user-search"] as const;

export type SearchTextState =
  | { kind: "empty" }
  | { kind: "too-short" }
  | { kind: "too-long" }
  | { kind: "ready"; text: string };

/**
 * Client-side copy of the API's rule (AC-D01.4): trimmed, then 2–50
 * characters counted as code points. Only `ready` text is ever sent.
 */
export function searchTextState(raw: string): SearchTextState {
  const text = raw.trim();
  const length = codePointLength(text);
  if (length === 0) {
    return { kind: "empty" };
  }
  if (length < USER_SEARCH_MIN_LENGTH) {
    return { kind: "too-short" };
  }
  if (length > USER_SEARCH_MAX_LENGTH) {
    return { kind: "too-long" };
  }
  return { kind: "ready", text };
}

/** `value`, once it has stopped changing for `delayMs`. */
export function useDebouncedValue<Value>(value: Value, delayMs: number): Value {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);
  return settled;
}

/**
 * People matching `text`, or an idle query when `text` is `null`. Results
 * are cached per lowercase text, and the previous results stay on screen
 * while the next ones load, so the list does not flash empty between keys.
 */
export function useUserSearch(text: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    enabled: text !== null,
    placeholderData: keepPreviousData,
    queryFn: () => apiClient.searchUsers(text ?? ""),
    queryKey: [...userSearchKey, (text ?? "").toLowerCase()],
    staleTime: 30_000,
  });
}
