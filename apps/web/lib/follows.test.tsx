import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { fakeApiClient, testSession } from "../components/test-utils";

import { ApiError } from "./api-client";
import { useFollowList, useFollowMember } from "./follows";
import { SessionProvider, usePublicProfile, useSession } from "./session";

import type { ApiClient } from "./api-client";
import type { FollowListItem } from "@twitter-clone/contracts";
import type { ReactNode } from "react";

const grace: FollowListItem = {
  followedByViewer: false,
  isViewer: false,
  user: {
    avatarUrl: null,
    displayName: "Grace",
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
    username: "grace",
  },
};

const graceProfile = {
  profile: {
    ...grace.user,
    bio: "",
    createdAt: "2026-11-24T12:00:00.000Z",
    followerCount: 4,
    followingCount: 0,
    tweetCount: 0,
  },
};

function renderFollows(apiClient: ApiClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionProvider apiClient={apiClient}>{children}</SessionProvider>
  );
  return renderHook(
    () => ({
      follow: useFollowMember({
        username: "grace",
        viewerUsername: testSession.user.username,
      }),
      list: useFollowList("ada", "following"),
      profile: usePublicProfile("grace"),
      session: useSession(),
    }),
    { wrapper },
  );
}

async function ready(apiClient: ApiClient) {
  const view = renderFollows(apiClient);
  await waitFor(() => {
    expect(view.result.current.session.data).toEqual(testSession);
    expect(view.result.current.list.isSuccess).toBe(true);
    expect(view.result.current.profile.isSuccess).toBe(true);
  });
  return view;
}

const rows = (view: Awaited<ReturnType<typeof ready>>) =>
  view.result.current.list.data?.pages.flatMap((page) => page.items) ?? [];

describe("follow lists", () => {
  it("US-C03 AC-C03.1 pages a list through the opaque cursor", async () => {
    const getFollowList = vi
      .fn<ApiClient["getFollowList"]>()
      .mockResolvedValueOnce({ items: [grace], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const view = await ready(
      fakeApiClient({ getFollowList, me: vi.fn(async () => testSession) }),
    );

    expect(view.result.current.list.hasNextPage).toBe(true);
    await act(() => view.result.current.list.fetchNextPage());

    expect(getFollowList).toHaveBeenNthCalledWith(
      1,
      "ada",
      "following",
      undefined,
    );
    expect(getFollowList).toHaveBeenNthCalledWith(
      2,
      "ada",
      "following",
      "next",
    );
    await waitFor(() =>
      expect(view.result.current.list.hasNextPage).toBe(false),
    );
  });
});

describe("follow member", () => {
  it("US-C01 AC-C01.1 flips the row at once, then keeps the committed count", async () => {
    let resolve: (
      value: Awaited<ReturnType<ApiClient["follow"]>>,
    ) => void = () => undefined;
    const follow = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ApiClient["follow"]>>>((done) => {
          resolve = done;
        }),
    );
    const view = await ready(
      fakeApiClient({
        follow,
        getFollowList: vi.fn(async () => ({
          items: [grace],
          nextCursor: null,
        })),
        getProfile: vi.fn(async () => graceProfile),
        me: vi.fn(async () => testSession),
      }),
    );

    act(() => view.result.current.follow.mutate(true));

    await waitFor(() => expect(rows(view)[0]?.followedByViewer).toBe(true));
    expect(follow).toHaveBeenCalledWith("grace", testSession.csrfToken);
    act(() => resolve({ relationship: { followerCount: 5, following: true } }));
    await waitFor(() =>
      expect(view.result.current.profile.data?.profile.followerCount).toBe(5),
    );
  });

  it("US-C01 AC-C01.4 rolls the row back when the API rejects the change", async () => {
    const view = await ready(
      fakeApiClient({
        getFollowList: vi.fn(async () => ({
          items: [{ ...grace, followedByViewer: true }],
          nextCursor: null,
        })),
        getProfile: vi.fn(async () => graceProfile),
        me: vi.fn(async () => testSession),
        unfollow: vi.fn(async () => {
          throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server.");
        }),
      }),
    );

    act(() => view.result.current.follow.mutate(false));

    await waitFor(() => expect(view.result.current.follow.isError).toBe(true));
    expect(rows(view)[0]?.followedByViewer).toBe(true);
    expect(view.result.current.profile.data?.profile.followerCount).toBe(4);
  });
});
