import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import { FollowListView } from "./follow-list-view";
import { fakeApiClient, renderWithSession, testSession } from "./test-utils";

import type { ApiClient } from "../lib/api-client";
import type { FollowListItem } from "@twitter-clone/contracts";

const member = (
  username: string,
  overrides: Partial<FollowListItem> = {},
): FollowListItem => ({
  followedByViewer: false,
  isViewer: false,
  user: {
    avatarUrl: null,
    displayName: username[0]?.toUpperCase() + username.slice(1),
    id: `0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f${username.length}${username.charCodeAt(0) % 10}`,
    username,
  },
  ...overrides,
});

const signedIn = { me: vi.fn(async () => testSession) };

describe("follow list view", () => {
  it("US-C03 AC-C03.1 lists members with links and follow controls, never for the viewer", async () => {
    renderWithSession(
      <FollowListView direction="followers" username="grace" />,
      fakeApiClient({
        ...signedIn,
        getFollowList: vi.fn(async () => ({
          items: [
            member("linus", { followedByViewer: true }),
            member("ada", { isViewer: true }),
            member("alan"),
          ],
          nextCursor: null,
        })),
      }),
    );

    const list = await screen.findByRole("list", { name: /Followers/ });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(
      within(rows[0] as HTMLElement).getByRole("link", { name: "@linus" }),
    ).toHaveAttribute("href", "/u/linus");
    expect(
      await within(rows[0] as HTMLElement).findByRole("button", {
        name: "Unfollow @linus",
      }),
    ).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText("(you)")).toBeVisible();
    expect(within(rows[1] as HTMLElement).queryByRole("button")).toBeNull();
    expect(
      within(rows[2] as HTMLElement).getByRole("button", {
        name: "Follow @alan",
      }),
    ).toBeVisible();
    expect(screen.getByText("That's everyone who follows them.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Followers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("US-C03 shows the list without follow controls when signed out", async () => {
    renderWithSession(
      <FollowListView direction="following" username="grace" />,
      fakeApiClient({
        getFollowList: vi.fn(async () => ({
          items: [member("linus")],
          nextCursor: null,
        })),
      }),
    );

    expect(await screen.findByText("@linus")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Follow/ })).toBeNull();
  });

  it("US-C03 AC-C03.2 shows a clear empty state", async () => {
    renderWithSession(
      <FollowListView direction="following" username="grace" />,
    );

    expect(await screen.findByText("Not following anyone yet.")).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("US-C03 AC-C03.1 loads the next page and then reports the end", async () => {
    const getFollowList = vi
      .fn<ApiClient["getFollowList"]>()
      .mockResolvedValueOnce({ items: [member("linus")], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [member("alan")], nextCursor: null });
    renderWithSession(
      <FollowListView direction="followers" username="grace" />,
      fakeApiClient({ getFollowList }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Load more" }),
    );

    expect(await screen.findByText("@alan")).toBeVisible();
    expect(screen.getByText("@linus")).toBeVisible();
    expect(getFollowList).toHaveBeenLastCalledWith(
      "grace",
      "followers",
      "next",
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "That's everyone who follows them.",
    );
  });

  it("US-C01 AC-C01.4 flips a follow at once and rolls it back on failure", async () => {
    let reject: (error: Error) => void = () => undefined;
    const follow = vi.fn(
      () =>
        new Promise<never>((_resolve, fail) => {
          reject = fail;
        }),
    );
    renderWithSession(
      <FollowListView direction="followers" username="grace" />,
      fakeApiClient({
        ...signedIn,
        follow,
        getFollowList: vi.fn(async () => ({
          items: [member("linus")],
          nextCursor: null,
        })),
      }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Follow @linus" }),
    );

    expect(
      await screen.findByRole("button", { name: "Unfollow @linus" }),
    ).toBeDisabled();
    expect(follow).toHaveBeenCalledWith("linus", testSession.csrfToken);
    reject(new ApiError(0, "NETWORK_ERROR", "Can't reach the server."));
    expect(
      await screen.findByRole("button", { name: "Follow @linus" }),
    ).toBeEnabled();
    expect(
      await screen.findByText("Couldn't follow. Try again."),
    ).toBeVisible();
  });

  it("US-C03 tells a missing profile apart from a failed load", async () => {
    const getFollowList = vi
      .fn<ApiClient["getFollowList"]>()
      .mockRejectedValueOnce(
        new ApiError(404, "NOT_FOUND", "That profile does not exist."),
      );
    const { unmount } = renderWithSession(
      <FollowListView direction="followers" username="nobody" />,
      fakeApiClient({ getFollowList }),
    );
    expect(
      await screen.findByText("That profile does not exist."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    unmount();

    const failing = vi
      .fn<ApiClient["getFollowList"]>()
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Offline."))
      .mockResolvedValueOnce({ items: [member("linus")], nextCursor: null });
    renderWithSession(
      <FollowListView direction="followers" username="grace" />,
      fakeApiClient({ getFollowList: failing }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    await waitFor(() => expect(screen.getByText("@linus")).toBeVisible());
  });
});
