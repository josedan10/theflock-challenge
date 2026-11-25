import { render, screen } from "@testing-library/react";
import { expect, vi } from "vitest";

import { SessionProvider } from "../lib/session";

import type { ApiClient } from "../lib/api-client";
import type { AuthSessionResponse, Tweet } from "@twitter-clone/contracts";
import type { ReactElement } from "react";

export const testSession: AuthSessionResponse = {
  csrfToken: "c".repeat(43),
  user: {
    avatarUrl: null,
    bio: "",
    createdAt: "2026-11-24T12:00:00.000Z",
    displayName: "Ada",
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
    username: "ada",
  },
};

export const testTweet: Tweet = {
  author: {
    avatarUrl: null,
    displayName: testSession.user.displayName,
    id: testSession.user.id,
    username: testSession.user.username,
  },
  content: "First post!",
  createdAt: "2026-11-24T12:00:00.000Z",
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
  likeCount: 0,
  likedByViewer: false,
  replyCount: 0,
};

export function fakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    createReply: vi.fn(async () => {
      throw new Error("not used");
    }),
    getThread: vi.fn(async () => {
      throw new Error("not used");
    }),
    createTweet: vi.fn(async (input: { content: string }) => ({
      tweet: { ...testTweet, content: input.content },
    })),
    deleteTweet: vi.fn(async () => undefined),
    follow: vi.fn(async () => ({
      relationship: { followerCount: 1, following: true },
    })),
    getFollowList: vi.fn(async () => ({ items: [], nextCursor: null })),
    searchUsers: vi.fn(async () => ({ items: [] })),
    getProfile: vi.fn(async () => ({
      profile: {
        ...testSession.user,
        followerCount: 0,
        followingCount: 0,
        tweetCount: 0,
      },
    })),
    logIn: vi.fn(async () => testSession),
    getTimeline: vi.fn(async () => ({ items: [], nextCursor: null })),
    logOut: vi.fn(async () => undefined),
    me: vi.fn(async () => null),
    like: vi.fn(async () => ({ like: { likeCount: 1, liked: true } })),
    getNotifications: vi.fn(async () => ({ items: [], nextCursor: null })),
    getUnreadCount: vi.fn(async () => ({ unreadCount: 0 })),
    markNotificationsRead: vi.fn(async () => ({ unreadCount: 0 })),
    register: vi.fn(async () => testSession),
    unlike: vi.fn(async () => ({ like: { likeCount: 0, liked: false } })),
    unfollow: vi.fn(async () => ({
      relationship: { followerCount: 0, following: false },
    })),
    updateProfile: vi.fn(async () => ({
      profile: {
        ...testSession.user,
        followerCount: 0,
        followingCount: 0,
        tweetCount: 0,
      },
    })),
    ...overrides,
  };
}

export function renderWithSession(
  ui: ReactElement,
  apiClient: ApiClient = fakeApiClient(),
) {
  return {
    apiClient,
    ...render(<SessionProvider apiClient={apiClient}>{ui}</SessionProvider>),
  };
}

/** The single form-level alert; field errors are alerts too and are skipped. */
export function formAlert(): HTMLElement {
  const alerts = screen
    .getAllByRole("alert")
    .filter((alert) => alert.getAttribute("data-slot") !== "field-error");
  expect(alerts).toHaveLength(1);
  return alerts[0] as HTMLElement;
}
