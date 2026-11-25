import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApiClient } from "../components/test-utils";

import {
  SEARCH_DEBOUNCE_MS,
  searchTextState,
  useDebouncedValue,
  useUserSearch,
} from "./search";
import { SessionProvider } from "./session";

import type { ApiClient } from "./api-client";
import type { ReactNode } from "react";

describe("searchTextState", () => {
  it.each([
    ["", { kind: "empty" }],
    ["   ", { kind: "empty" }],
    ["a", { kind: "too-short" }],
    [" a ", { kind: "too-short" }],
    ["😀", { kind: "too-short" }],
    ["ad", { kind: "ready", text: "ad" }],
    ["  Ada  ", { kind: "ready", text: "Ada" }],
    ["a".repeat(50), { kind: "ready", text: "a".repeat(50) }],
    ["a".repeat(51), { kind: "too-long" }],
  ])("US-D01 AC-D01.4 classifies %j", (raw, expected) => {
    expect(searchTextState(raw)).toEqual(expected);
  });
});

describe("useDebouncedValue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("US-D01 waits for typing to pause before settling", () => {
    vi.useFakeTimers();
    const { rerender, result } = renderHook(
      ({ value }) => useDebouncedValue(value, SEARCH_DEBOUNCE_MS),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ad" });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    rerender({ value: "ada" });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("ada");
  });
});

describe("useUserSearch", () => {
  const wrapperFor =
    (apiClient: ApiClient) =>
    ({ children }: { children: ReactNode }) => (
      <SessionProvider apiClient={apiClient}>{children}</SessionProvider>
    );

  it("US-D01 AC-D01.4 sends nothing while there is no ready text", () => {
    const searchUsers = vi.fn<ApiClient["searchUsers"]>();
    renderHook(() => useUserSearch(null), {
      wrapper: wrapperFor(fakeApiClient({ searchUsers })),
    });

    expect(searchUsers).not.toHaveBeenCalled();
  });

  it("US-D01 searches and caches case-insensitively", async () => {
    const searchUsers = vi.fn<ApiClient["searchUsers"]>(async () => ({
      items: [],
    }));
    const { rerender, result } = renderHook(({ text }) => useUserSearch(text), {
      initialProps: { text: "Ada" },
      wrapper: wrapperFor(fakeApiClient({ searchUsers })),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ text: "ada" });

    expect(searchUsers).toHaveBeenCalledTimes(1);
    expect(searchUsers).toHaveBeenCalledWith("Ada");
  });
});
