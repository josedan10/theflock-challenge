import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import { NotificationsView } from "./notifications-view";
import { fakeApiClient, renderWithSession, testSession } from "./test-utils";

import type { ApiClient } from "../lib/api-client";
import type { Notification } from "@twitter-clone/contracts";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  replace.mockReset();
});

const actor = {
  avatarUrl: null,
  displayName: "Grace",
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
  username: "grace",
};
const tweet = {
  content: "<b>Ada's tweet</b>",
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f71",
};
const notice = (
  id: string,
  type: Notification["type"],
  read = false,
): Notification => ({
  actor,
  createdAt: "2026-11-25T12:00:00.000Z",
  id: `0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f${id}`,
  read,
  tweet: type === "follow" ? null : tweet,
  type,
});

function signedIn(overrides: Partial<ApiClient> = {}) {
  return fakeApiClient({ me: vi.fn(async () => testSession), ...overrides });
}

describe("NotificationsView", () => {
  it("NOT-01 lists follows, likes and replies with their targets and unread state", async () => {
    renderWithSession(
      <NotificationsView />,
      signedIn({
        getNotifications: vi.fn(async () => ({
          items: [
            notice("a1", "reply"),
            notice("a2", "like"),
            notice("a3", "follow", true),
          ],
          nextCursor: null,
        })),
        getUnreadCount: vi.fn(async () => ({ unreadCount: 2 })),
      }),
    );

    const list = await screen.findByRole("list", { name: "Notifications" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringMatching(/Unread\. Grace replied to your tweet/),
      expect.stringMatching(/Unread\. Grace liked your tweet/),
      expect.stringMatching(/Grace followed you/),
    ]);
    expect(links[2]).not.toHaveTextContent("Unread.");
    expect(links[0]).toHaveAttribute("href", `/tweets/${tweet.id}`);
    expect(links[2]).toHaveAttribute("href", "/u/grace");
    expect(within(list).getAllByText("<b>Ada's tweet</b>")).toHaveLength(2);
    expect(list.querySelector("b")).toBeNull();
    expect(screen.getByText("You're all caught up.")).toBeVisible();
  });

  it("US-B05 says when someone mentioned you and opens that tweet", async () => {
    renderWithSession(
      <NotificationsView />,
      signedIn({
        getNotifications: vi.fn(async () => ({
          items: [notice("a4", "mention")],
          nextCursor: null,
        })),
        getUnreadCount: vi.fn(async () => ({ unreadCount: 1 })),
      }),
    );

    const link = await screen.findByRole("link", {
      name: /Grace mentioned you/,
    });
    expect(link).toHaveAttribute("href", `/tweets/${tweet.id}`);
  });

  it("NOT-01 marks a notification read when it is opened", async () => {
    const markNotificationsRead = vi.fn(async () => ({ unreadCount: 0 }));
    renderWithSession(
      <NotificationsView />,
      signedIn({
        getNotifications: vi.fn(async () => ({
          items: [notice("a2", "like"), notice("a3", "follow", true)],
          nextCursor: null,
        })),
        getUnreadCount: vi.fn(async () => ({ unreadCount: 1 })),
        markNotificationsRead,
      }),
    );
    const [unreadLink, readLink] = within(
      await screen.findByRole("list", { name: "Notifications" }),
    ).getAllByRole("link");

    // Opening an already read one does nothing.
    fireEvent.click(readLink as HTMLElement);
    fireEvent.click(unreadLink as HTMLElement);

    await waitFor(() =>
      expect(markNotificationsRead).toHaveBeenCalledWith(
        { ids: [notice("a2", "like").id] },
        testSession.csrfToken,
      ),
    );
    expect(markNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it("NOT-01 marks everything read, and disables the button when nothing is unread", async () => {
    const markNotificationsRead = vi.fn(async () => ({ unreadCount: 0 }));
    renderWithSession(
      <NotificationsView />,
      signedIn({
        getNotifications: vi.fn(async () => ({
          items: [notice("a2", "like")],
          nextCursor: null,
        })),
        getUnreadCount: vi.fn(async () => ({ unreadCount: 1 })),
        markNotificationsRead,
      }),
    );

    const button = await screen.findByRole("button", {
      name: "Mark all as read",
    });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(markNotificationsRead).toHaveBeenCalledWith(
      { all: true },
      testSession.csrfToken,
    );
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.queryByText(/^Unread\./)).toBeNull();
  });

  it("NOT-01 explains a failed mark-all and keeps items unread", async () => {
    renderWithSession(
      <NotificationsView />,
      signedIn({
        getNotifications: vi.fn(async () => ({
          items: [notice("a2", "like")],
          nextCursor: null,
        })),
        getUnreadCount: vi.fn(async () => ({ unreadCount: 1 })),
        markNotificationsRead: vi.fn(async () => {
          throw new ApiError(0, "NETWORK_ERROR", "Offline.");
        }),
      }),
    );
    const button = await screen.findByRole("button", {
      name: "Mark all as read",
    });
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.click(button);

    expect(
      await screen.findByText(/couldn't mark your notifications as read/),
    ).toBeVisible();
    expect(screen.getByText(/^Unread\./)).toBeInTheDocument();
  });

  it("NOT-01 shows a clear empty state", async () => {
    renderWithSession(<NotificationsView />, signedIn());

    expect(await screen.findByText("No notifications yet")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Mark all as read" }),
    ).toBeDisabled();
  });

  it("NOT-01 loads older notifications, and retries a failed first load", async () => {
    const getNotifications = vi
      .fn<ApiClient["getNotifications"]>()
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Offline."))
      .mockResolvedValueOnce({
        items: [notice("a1", "reply")],
        nextCursor: "older",
      })
      .mockResolvedValueOnce({
        items: [notice("a3", "follow", true)],
        nextCursor: null,
      });
    renderWithSession(<NotificationsView />, signedIn({ getNotifications }));

    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Load more" }),
    );

    expect(await screen.findByText(/followed you/)).toBeVisible();
    expect(getNotifications).toHaveBeenLastCalledWith("older");
  });

  it("NOT-01 sends a signed-out visitor to /login", async () => {
    renderWithSession(<NotificationsView />, fakeApiClient());

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
