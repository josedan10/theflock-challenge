import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  fakeApiClient,
  testSession,
  testTweet,
} from "../components/test-utils";

import { ApiError } from "./api-client";
import { SessionProvider, useSession } from "./session";
import { useCreateTweet, useDeleteTweet, useTimelineItems } from "./tweets";

import type { ApiClient } from "./api-client";
import type { Tweet } from "@twitter-clone/contracts";
import type { ReactNode } from "react";

const member = { id: testSession.user.id, username: testSession.user.username };

function renderTweets(apiClient: ApiClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionProvider apiClient={apiClient}>{children}</SessionProvider>
  );
  return renderHook(
    () => ({
      create: useCreateTweet(member),
      remove: useDeleteTweet(member),
      posted: useTimelineItems(member.id),
      session: useSession(),
    }),
    { wrapper },
  );
}

const tweetWith = (id: string, content: string): Tweet => ({
  ...testTweet,
  content,
  id,
});

async function signedIn(apiClient: ApiClient) {
  const view = renderTweets(apiClient);
  await waitFor(() =>
    expect(view.result.current.session.data).toEqual(testSession),
  );
  return view;
}

describe("posted tweets", () => {
  it("starts empty", async () => {
    const { result } = await signedIn(
      fakeApiClient({ me: vi.fn(async () => testSession) }),
    );

    expect(result.current.posted).toEqual([]);
  });

  it("US-B01 AC-B01.1 prepends the canonical card with the CSRF token", async () => {
    const apiClient = fakeApiClient({
      createTweet: vi
        .fn()
        .mockResolvedValueOnce({ tweet: tweetWith("t1", "one") })
        .mockResolvedValueOnce({ tweet: tweetWith("t2", "two") }),
      me: vi.fn(async () => testSession),
    });
    const { result } = await signedIn(apiClient);

    await act(() => result.current.create.mutateAsync({ content: "one" }));
    await act(() => result.current.create.mutateAsync({ content: "two" }));

    await waitFor(() =>
      expect(result.current.posted.map((tweet) => tweet.id)).toEqual([
        "t2",
        "t1",
      ]),
    );
    expect(apiClient.createTweet).toHaveBeenCalledWith(
      { content: "one" },
      testSession.csrfToken,
    );
  });
});

describe("deleting a posted tweet", () => {
  async function withThreeTweets(deleteTweet: ApiClient["deleteTweet"]) {
    const apiClient = fakeApiClient({
      createTweet: vi
        .fn()
        .mockResolvedValueOnce({ tweet: tweetWith("t1", "one") })
        .mockResolvedValueOnce({ tweet: tweetWith("t2", "two") })
        .mockResolvedValueOnce({ tweet: tweetWith("t3", "three") }),
      deleteTweet,
      me: vi.fn(async () => testSession),
    });
    const view = await signedIn(apiClient);
    for (const content of ["one", "two", "three"]) {
      await act(() => view.result.current.create.mutateAsync({ content }));
    }
    // Wait for React to flush: result.current can lag behind the cache.
    await waitFor(() => expect(view.result.current.posted).toHaveLength(3));
    return { apiClient, ...view };
  }

  const ids = (tweets: Tweet[] | undefined) => tweets?.map((tweet) => tweet.id);

  it("US-B02 AC-B02.1 removes the tweet before the server answers", async () => {
    let finish: () => void = () => undefined;
    const { apiClient, result } = await withThreeTweets(
      vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
    );

    act(() => result.current.remove.mutate("t2"));

    await waitFor(() =>
      expect(ids(result.current.posted)).toEqual(["t3", "t1"]),
    );
    expect(apiClient.deleteTweet).toHaveBeenCalledWith(
      "t2",
      testSession.csrfToken,
    );
    await act(async () => finish());
    await waitFor(() =>
      expect(ids(result.current.posted)).toEqual(["t3", "t1"]),
    );
  });

  it("US-B02 AC-B02.3 restores the tweet in its original position when the delete fails", async () => {
    const { result } = await withThreeTweets(
      vi.fn(async () => {
        throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server.");
      }),
    );

    await act(() =>
      result.current.remove.mutateAsync("t2").catch(() => undefined),
    );

    await waitFor(() =>
      expect(ids(result.current.posted)).toEqual(["t3", "t2", "t1"]),
    );
  });

  it("keeps a tweet removed when the server says it no longer exists", async () => {
    const { result } = await withThreeTweets(
      vi.fn(async () => {
        throw new ApiError(404, "NOT_FOUND", "That tweet does not exist.");
      }),
    );

    await act(() =>
      result.current.remove.mutateAsync("t2").catch(() => undefined),
    );

    await waitFor(() =>
      expect(ids(result.current.posted)).toEqual(["t3", "t1"]),
    );
  });

  it("US-B02 AC-B02.3 restores only the failed tweet when deletes overlap", async () => {
    let failA: () => void = () => undefined;
    const { result } = await withThreeTweets(
      vi.fn((tweetId: string) =>
        tweetId === "t1"
          ? new Promise<void>((_resolve, reject) => {
              failA = () =>
                reject(
                  new ApiError(0, "NETWORK_ERROR", "Can't reach the server."),
                );
            })
          : Promise.resolve(),
      ),
    );

    // t1 (oldest) is pending when t3 is deleted successfully; then t1 fails.
    act(() => result.current.remove.mutate("t1"));
    await waitFor(() =>
      expect(ids(result.current.posted)).toEqual(["t3", "t2"]),
    );
    await act(() => result.current.remove.mutateAsync("t3"));
    await act(async () => failA());

    // t3 must stay deleted; t1 comes back in its original (last) position.
    await waitFor(() =>
      expect(ids(result.current.posted)).toEqual(["t2", "t1"]),
    );
  });

  it("US-B02 AC-B02.3 restores a loaded timeline tweet in its page position", async () => {
    const newer = tweetWith("t3", "three");
    const middle = tweetWith("t2", "two");
    const older = tweetWith("t1", "one");
    const { result } = await signedIn(
      fakeApiClient({
        deleteTweet: vi.fn(async () => {
          throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server.");
        }),
        getTimeline: vi.fn(async () => ({
          items: [newer, middle, older],
          nextCursor: null,
        })),
        me: vi.fn(async () => testSession),
      }),
    );
    await waitFor(() => expect(result.current.posted).toHaveLength(3));

    await act(() =>
      result.current.remove.mutateAsync("t2").catch(() => undefined),
    );

    await waitFor(() =>
      expect(ids(result.current.posted)).toEqual(["t3", "t2", "t1"]),
    );
  });
});
