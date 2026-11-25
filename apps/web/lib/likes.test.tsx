import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  fakeApiClient,
  testSession,
  testTweet,
} from "../components/test-utils";

import { ApiError } from "./api-client";
import { patchTweetCards, useLikeTweet } from "./likes";
import { SessionProvider, useSession } from "./session";
import { useTimelineItems } from "./tweets";

import type { ApiClient } from "./api-client";
import type { ReactNode } from "react";

const other = { ...testTweet, id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f99" };
const liked = { likeCount: 5, likedByViewer: true };

describe("patchTweetCards", () => {
  it("patches lists, pages, thread pages and infinite data, and nothing else", () => {
    expect(patchTweetCards([testTweet, other], testTweet.id, liked)).toEqual([
      { ...testTweet, ...liked },
      other,
    ]);
    expect(
      patchTweetCards(
        {
          pageParams: [undefined],
          pages: [{ items: [other], nextCursor: null, selected: testTweet }],
        },
        testTweet.id,
        liked,
      ),
    ).toEqual({
      pageParams: [undefined],
      pages: [
        {
          items: [other],
          nextCursor: null,
          selected: { ...testTweet, ...liked },
        },
      ],
    });
    const profile = { profile: { id: testTweet.id } };
    expect(patchTweetCards(profile, testTweet.id, liked)).toBe(profile);
    expect(patchTweetCards(undefined, testTweet.id, liked)).toBeUndefined();
  });
});

describe("useLikeTweet", () => {
  function render(apiClient: ApiClient) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SessionProvider apiClient={apiClient}>{children}</SessionProvider>
    );
    return renderHook(
      () => ({
        like: useLikeTweet(testTweet.id),
        session: useSession(),
        timeline: useTimelineItems(testSession.user.id),
      }),
      { wrapper },
    );
  }

  async function ready(apiClient: ApiClient) {
    const view = render(apiClient);
    await waitFor(() => {
      expect(view.result.current.session.data).toEqual(testSession);
      expect(view.result.current.timeline).toHaveLength(1);
    });
    return view;
  }

  const card = (view: Awaited<ReturnType<typeof ready>>) =>
    view.result.current.timeline[0];

  it("US-C02 AC-C02.2 updates the card at once, then keeps the committed count", async () => {
    let resolve: (value: Awaited<ReturnType<ApiClient["like"]>>) => void = () =>
      undefined;
    const like = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ApiClient["like"]>>>((done) => {
          resolve = done;
        }),
    );
    const view = await ready(
      fakeApiClient({
        getTimeline: vi.fn(async () => ({
          items: [testTweet],
          nextCursor: null,
        })),
        like,
        me: vi.fn(async () => testSession),
      }),
    );

    act(() =>
      view.result.current.like.mutate({
        like: true,
        previous: { likeCount: 0, likedByViewer: false },
      }),
    );

    await waitFor(() =>
      expect(card(view)).toMatchObject({ likeCount: 1, likedByViewer: true }),
    );
    expect(like).toHaveBeenCalledWith(testTweet.id, testSession.csrfToken);
    act(() => resolve({ like: { likeCount: 7, liked: true } }));
    await waitFor(() => expect(card(view)?.likeCount).toBe(7));
  });

  it("US-C02 AC-C02.2 rolls the card back when the API rejects the change", async () => {
    const view = await ready(
      fakeApiClient({
        getTimeline: vi.fn(async () => ({
          items: [{ ...testTweet, likeCount: 3, likedByViewer: true }],
          nextCursor: null,
        })),
        me: vi.fn(async () => testSession),
        unlike: vi.fn(async () => {
          throw new ApiError(0, "NETWORK_ERROR", "Offline.");
        }),
      }),
    );

    act(() =>
      view.result.current.like.mutate({
        like: false,
        previous: { likeCount: 3, likedByViewer: true },
      }),
    );

    await waitFor(() => expect(view.result.current.like.isError).toBe(true));
    expect(card(view)).toMatchObject({ likeCount: 3, likedByViewer: true });
  });
});
