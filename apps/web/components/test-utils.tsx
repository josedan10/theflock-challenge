import { render, screen } from "@testing-library/react";
import { expect, vi } from "vitest";

import { SessionProvider } from "../lib/session";

import type { ApiClient } from "../lib/api-client";
import type { AuthSessionResponse } from "@twitter-clone/contracts";
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

export function fakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getProfile: vi.fn(async () => ({
      profile: {
        ...testSession.user,
        followerCount: 0,
        followingCount: 0,
        tweetCount: 0,
      },
    })),
    logIn: vi.fn(async () => testSession),
    logOut: vi.fn(async () => undefined),
    me: vi.fn(async () => null),
    register: vi.fn(async () => testSession),
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
