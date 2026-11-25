import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import { ProfileView } from "./profile-view";
import {
  fakeApiClient,
  renderWithSession,
  testSession,
  testTweet,
} from "./test-utils";

const profile = {
  ...testSession.user,
  bio: "First programmer\n<script>alert('no')</script>",
  followerCount: 12,
  followingCount: 7,
  tweetCount: 31,
};

describe("profile view", () => {
  it("US-A03 AC-A03.1 renders identity, placeholder, bio, and counts", async () => {
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        getProfile: vi.fn(async () => ({ profile })),
        me: vi.fn(async () => null),
      }),
    );

    expect(await screen.findByRole("heading", { name: "Ada" })).toBeVisible();
    expect(screen.getByText("@ada")).toBeVisible();
    expect(screen.getByLabelText("Ada's avatar placeholder")).toBeVisible();
    expect(screen.getByText("31")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
    expect(screen.getByText("7")).toBeVisible();
  });

  it("PRO-02 shortens large counts and keeps the exact number in the title", async () => {
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        getProfile: vi.fn(async () => ({
          profile: {
            ...profile,
            followerCount: 2_345_678,
            followingCount: 1_100,
            tweetCount: 999,
          },
        })),
      }),
    );

    const followers = await screen.findByRole("link", {
      name: "2.3M Followers",
    });
    expect(followers).toHaveAttribute("title", "2,345,678 followers");
    expect(screen.getByRole("link", { name: "1.1k Following" })).toBeVisible();
    const stats = screen.getByRole("list", { name: "Profile statistics" });
    expect(stats).toHaveTextContent("999 Tweets");
  });

  it("US-C03 links the follower and following counts to their lists", async () => {
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({ getProfile: vi.fn(async () => ({ profile })) }),
    );

    expect(
      await screen.findByRole("link", { name: "12 Followers" }),
    ).toHaveAttribute("href", "/u/ada/followers");
    expect(screen.getByRole("link", { name: "7 Following" })).toHaveAttribute(
      "href",
      "/u/ada/following",
    );
    expect(screen.queryByRole("link", { name: /Tweets/ })).toBeNull();
  });

  it("US-A03 AC-A03.3 renders a hostile bio as text, never markup", async () => {
    const { container } = renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        getProfile: vi.fn(async () => ({ profile })),
        me: vi.fn(async () => null),
      }),
    );

    expect(await screen.findByText(/<script>alert/)).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders a supported avatar URL with useful alternative text", async () => {
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        getProfile: vi.fn(async () => ({
          profile: { ...profile, avatarUrl: "https://images.example/ada.webp" },
        })),
      }),
    );

    expect(await screen.findByAltText("Ada's avatar")).toHaveAttribute(
      "src",
      "https://images.example/ada.webp",
    );
  });

  it("US-A03 AC-A03.2 shows an explicit not-found state", async () => {
    renderWithSession(
      <ProfileView username="missing" />,
      fakeApiClient({
        getProfile: vi.fn(async () => {
          throw new ApiError(404, "NOT_FOUND", "That profile does not exist.");
        }),
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Profile not found" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("offers retry for a recoverable profile error", async () => {
    const getProfile = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Offline"))
      .mockResolvedValueOnce({ profile });
    const user = userEvent.setup();
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({ getProfile }),
    );

    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Ada" })).toBeVisible();
    expect(getProfile).toHaveBeenCalledTimes(2);
  });

  it("PROFILE-02 lets the owner edit and refreshes the visible profile", async () => {
    const updated = {
      ...profile,
      bio: "Analytical engine enthusiast",
      displayName: "Ada Lovelace",
    };
    const updateProfile = vi.fn(async () => ({ profile: updated }));
    const user = userEvent.setup();
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        getProfile: vi.fn(async () => ({ profile })),
        me: vi.fn(async () => testSession),
        updateProfile,
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Ada Lovelace");
    await user.clear(screen.getByLabelText("Bio"));
    await user.type(
      screen.getByLabelText("Bio"),
      "Analytical engine enthusiast",
    );
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        {
          bio: "Analytical engine enthusiast",
          displayName: "Ada Lovelace",
        },
        testSession.csrfToken,
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "Ada Lovelace" }),
    ).toBeVisible();
  });

  it("PROFILE-02 focuses the first invalid edit field", async () => {
    const user = userEvent.setup();
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        getProfile: vi.fn(async () => ({ profile })),
        me: vi.fn(async () => testSession),
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "   " },
    });
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveFocus(),
    );
    expect(screen.getByText("Fix the highlighted fields.")).toBeVisible();
  });

  it("PROFILE-02 can cancel an edit without sending a request", async () => {
    const updateProfile = vi.fn();
    const user = userEvent.setup();
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        getProfile: vi.fn(async () => ({ profile })),
        me: vi.fn(async () => testSession),
        updateProfile,
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("form", { name: "Edit profile" })).toBeNull();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("PROFILE-02 exposes a server field error and restores the save control", async () => {
    const user = userEvent.setup();
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        getProfile: vi.fn(async () => ({ profile })),
        me: vi.fn(async () => testSession),
        updateProfile: vi.fn(async () => {
          throw new ApiError(422, "VALIDATION_ERROR", "Invalid profile.", {
            bio: ["Must be at most 160 characters."],
          });
        }),
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Invalid profile.")).toBeVisible();
    expect(screen.getByText("Must be at most 160 characters.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
  });

  it("PROFILE-03 AC-A03.4 lists posts newest-first, including a reply, and loads the next page", async () => {
    const older = {
      ...testTweet,
      content: "Older root",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f62",
      replyingTo: null,
    };
    const reply = {
      ...testTweet,
      content: "A reply",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f63",
      replyingTo: "grace",
    };
    const getProfilePosts = vi
      .fn()
      .mockResolvedValueOnce({
        items: [reply],
        nextCursor: "older",
      })
      .mockResolvedValueOnce({ items: [older], nextCursor: null });
    const user = userEvent.setup();
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        getProfile: vi.fn(async () => ({ profile })),
        getProfilePosts,
        me: vi.fn(async () => null),
      }),
    );

    const list = await screen.findByRole("list", { name: "Posts" });
    expect(list).toHaveTextContent("A reply");
    expect(screen.getByRole("link", { name: "@grace" })).toHaveAttribute(
      "href",
      "/u/grace",
    );
    expect(
      screen.queryByRole("button", { name: "Delete tweet" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(getProfilePosts).toHaveBeenLastCalledWith("ada", "older");
    expect(list).toHaveTextContent("Older root");
    expect(screen.getByText("That's everything.")).toBeVisible();
  });

  it("PROFILE-03 AC-A03.4 shows an empty list and retries a failed load", async () => {
    const user = userEvent.setup();
    const getProfilePosts = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Down."))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        getProfile: vi.fn(async () => ({ profile })),
        getProfilePosts,
      }),
    );

    expect(
      await screen.findByText("We couldn't load these posts."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No posts yet.")).toBeVisible();
    expect(getProfilePosts).toHaveBeenCalledTimes(2);
  });

  it("US-B02 AC-B02.3 asks before deleting a post on the author's profile", async () => {
    const user = userEvent.setup();
    const deleteTweet = vi.fn(async () => undefined);
    renderWithSession(
      <ProfileView username="ada" />,
      fakeApiClient({
        deleteTweet,
        getProfile: vi.fn(async () => ({ profile })),
        getProfilePosts: vi.fn(async () => ({
          items: [{ ...testTweet, replyingTo: null }],
          nextCursor: null,
        })),
        me: vi.fn(async () => testSession),
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Delete tweet" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete this tweet?",
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dialog).not.toBeVisible();
    expect(deleteTweet).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete tweet" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(deleteTweet).toHaveBeenCalledWith(
        testTweet.id,
        testSession.csrfToken,
      ),
    );
  });
});
