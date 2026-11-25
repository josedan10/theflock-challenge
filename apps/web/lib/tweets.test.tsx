import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fakeApiClient,
  testSession,
  testTweet,
} from "../components/test-utils";

import { ApiError } from "./api-client";
import { UNDO_WINDOW_MS, useUndoWindows } from "./post-undo";
import { SessionProvider, useSession } from "./session";
import {
  useCreateTweet,
  useDeleteTweet,
  useFreshReplies,
  useHomeTimeline,
  useTimelineItems,
  useTimelineLive,
} from "./tweets";

import type { ApiClient } from "./api-client";
import type { Tweet } from "@twitter-clone/contracts";
import type { ReactNode } from "react";

const member = { id: testSession.user.id, username: testSession.user.username };

class FakeEventSource {
  static latest: FakeEventSource | undefined;
  readonly url: string;
  readonly withCredentials: boolean;
  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials === true;
    FakeEventSource.latest = this;
  }

  addEventListener(type: string, listener: EventListener): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    FakeEventSource.latest = undefined;
  }

  emit(type: string, data: string): void {
    const event = new MessageEvent(type, { data });
    this.listeners.get(type)?.forEach((listener) => {
      listener(event);
    });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeEventSource.latest = undefined;
});

function renderTweets(apiClient: ApiClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionProvider apiClient={apiClient}>{children}</SessionProvider>
  );
  return renderHook(
    () => ({
      create: useCreateTweet(member),
      reply: useCreateTweet(member, "parent-id"),
      fresh: useFreshReplies(member.id, "parent-id"),
      undo: useUndoWindows(member.id),
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

describe("undo windows for new posts", () => {
  it("TWT-03 AC-B01.6 opens a window for a home post and for a reply", async () => {
    const apiClient = fakeApiClient({
      createReply: vi.fn(async () => ({ tweet: tweetWith("r1", "reply") })),
      createTweet: vi.fn(async () => ({ tweet: tweetWith("t1", "one") })),
      me: vi.fn(async () => testSession),
    });
    const { result } = await signedIn(apiClient);
    const before = Date.now();

    await act(() => result.current.create.mutateAsync({ content: "one" }));
    await act(() => result.current.reply.mutateAsync({ content: "reply" }));

    await waitFor(() =>
      expect(Object.keys(result.current.undo)).toEqual(["t1", "r1"]),
    );
    expect(result.current.undo.t1).toBeGreaterThanOrEqual(
      before + UNDO_WINDOW_MS,
    );
    expect(result.current.fresh.map((tweet) => tweet.id)).toEqual(["r1"]);
    expect(result.current.fresh[0]?.parentTweetId).toBe("parent-id");
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

describe("US-F01 live timeline", () => {
  it("AC-F01.2/3 refetches cards, announces without a duplicate, and sends cookies", async () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const liveTweet = {
      ...tweetWith("0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f77", "from grace"),
      createdAt: "2026-11-24T13:00:00.000Z",
    };
    const getTimeline = vi
      .fn()
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValue({ items: [liveTweet], nextCursor: null });
    const apiClient = fakeApiClient({
      getTimeline,
      me: vi.fn(async () => testSession),
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SessionProvider apiClient={apiClient}>{children}</SessionProvider>
    );
    const view = renderHook(
      () => ({
        live: useTimelineLive(member.id, true),
        posted: useTimelineItems(member.id),
        session: useSession(),
        timeline: useHomeTimeline(member.id),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(view.result.current.session.data).toEqual(testSession),
    );
    await waitFor(() =>
      expect(view.result.current.timeline.isSuccess).toBe(true),
    );
    expect(FakeEventSource.latest?.withCredentials).toBe(true);
    expect(FakeEventSource.latest?.url).toBe(
      "http://api.test/v1/timeline/stream",
    );

    act(() => {
      FakeEventSource.latest?.emit(
        "timeline.tweet",
        JSON.stringify({ tweetId: liveTweet.id }),
      );
    });
    await waitFor(() =>
      expect(view.result.current.posted.map((tweet) => tweet.content)).toEqual([
        "from grace",
      ]),
    );
    expect(view.result.current.live).toBe("1 new post");

    act(() => {
      FakeEventSource.latest?.emit(
        "timeline.tweet",
        JSON.stringify({ tweetId: liveTweet.id }),
      );
    });
    await waitFor(() => expect(getTimeline).toHaveBeenCalledTimes(2));
  });
});
