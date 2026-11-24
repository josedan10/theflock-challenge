import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import { ProfileView } from "./profile-view";
import { fakeApiClient, renderWithSession, testSession } from "./test-utils";

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
});
