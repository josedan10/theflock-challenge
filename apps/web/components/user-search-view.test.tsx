import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import { fakeApiClient, renderWithSession, testSession } from "./test-utils";
import { UserSearchView } from "./user-search-view";

import type { ApiClient } from "../lib/api-client";
import type { FollowListItem } from "@twitter-clone/contracts";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  replace.mockReset();
  window.history.replaceState(null, "", "/search");
});

const grace: FollowListItem = {
  followedByViewer: false,
  isViewer: false,
  user: {
    avatarUrl: null,
    displayName: "Grace Hopper",
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
    username: "grace",
  },
};

function signedIn(searchUsers: ApiClient["searchUsers"]) {
  return fakeApiClient({ me: vi.fn(async () => testSession), searchUsers });
}

const field = () => screen.getByRole("searchbox", { name: "Name or username" });

describe("UserSearchView", () => {
  it("US-D01 AC-D01.4 asks for more text and sends nothing for one character", async () => {
    const searchUsers = vi.fn<ApiClient["searchUsers"]>();
    renderWithSession(<UserSearchView />, signedIn(searchUsers));

    expect(screen.getByText("Find people to follow")).toBeVisible();
    await userEvent.type(field(), "g");

    expect(
      await screen.findByText("Keep typing: at least 2 characters."),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it("US-D01 AC-D01.1 searches once after typing pauses and lists members with follow controls", async () => {
    const searchUsers = vi.fn<ApiClient["searchUsers"]>(async () => ({
      items: [grace],
    }));
    renderWithSession(<UserSearchView />, signedIn(searchUsers));

    await userEvent.type(field(), "@Gra");

    const results = await screen.findByRole("list", { name: "Search results" });
    expect(searchUsers).toHaveBeenCalledTimes(1);
    expect(searchUsers).toHaveBeenCalledWith("Gra");
    expect(
      within(results).getByRole("link", { name: "@grace" }),
    ).toHaveAttribute("href", "/u/grace");
    expect(
      await within(results).findByRole("button", { name: "Follow @grace" }),
    ).toBeVisible();
    expect(screen.getByTestId("search-announcer")).toHaveTextContent(
      "1 person found.",
    );
    await waitFor(() => expect(window.location.search).toBe("?q=%40Gra"));
  });

  it("US-D01 shows a clear empty state for no matches", async () => {
    renderWithSession(
      <UserSearchView initialQuery="zzz" />,
      signedIn(vi.fn(async () => ({ items: [] }))),
    );

    expect(await screen.findByText("No people match “zzz”.")).toBeVisible();
    expect(screen.getByTestId("search-announcer")).toHaveTextContent(
      "No people found.",
    );
  });

  it("US-D01 explains a failed search and retries it", async () => {
    const searchUsers = vi
      .fn<ApiClient["searchUsers"]>()
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Offline."))
      .mockResolvedValueOnce({ items: [grace] });
    renderWithSession(
      <UserSearchView initialQuery="grace" />,
      signedIn(searchUsers),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );

    expect(await screen.findByRole("link", { name: "@grace" })).toBeVisible();
    expect(searchUsers).toHaveBeenCalledTimes(2);
  });

  it("US-D01 AC-D01.4 flags text over 50 characters and sends nothing", async () => {
    const searchUsers = vi.fn<ApiClient["searchUsers"]>();
    renderWithSession(
      <UserSearchView initialQuery={"a".repeat(51)} />,
      signedIn(searchUsers),
    );

    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Use at most 50 characters.")).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it("US-D01 sends a signed-out visitor to /login", async () => {
    renderWithSession(<UserSearchView />, fakeApiClient());

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
