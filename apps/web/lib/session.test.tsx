import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useLogIn,
  useLogOut,
  useRegister,
  useSession,
  useUpdateProfile,
  SessionProvider,
} from "./session";

import type { ApiClient } from "./api-client";
import type { ReactNode } from "react";

const session = {
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

function fakeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    createTweet: vi.fn(async () => {
      throw new Error("not used");
    }),
    deleteTweet: vi.fn(async () => undefined),
    getProfile: vi.fn(async () => ({
      profile: {
        ...session.user,
        followerCount: 0,
        followingCount: 0,
        tweetCount: 0,
      },
    })),
    getTimeline: vi.fn(async () => ({ items: [], nextCursor: null })),
    logIn: vi.fn(async () => session),
    logOut: vi.fn(async () => undefined),
    me: vi.fn(async () => null),
    register: vi.fn(async () => session),
    updateProfile: vi.fn(async () => ({
      profile: {
        ...session.user,
        followerCount: 0,
        followingCount: 0,
        tweetCount: 0,
      },
    })),
    ...overrides,
  };
}

function renderWithSession<Result>(hook: () => Result, apiClient: ApiClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionProvider apiClient={apiClient}>{children}</SessionProvider>
  );
  return renderHook(hook, { wrapper });
}

describe("session state", () => {
  it("US-A02 AC-A02.4 reports a signed-out visitor as null", async () => {
    const { result } = renderWithSession(() => useSession(), fakeClient());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("US-A01 AC-A01.1 stores the session returned by registration", async () => {
    const apiClient = fakeClient();
    const { result } = renderWithSession(
      () => ({ register: useRegister(), session: useSession() }),
      apiClient,
    );
    await waitFor(() => expect(result.current.session.isSuccess).toBe(true));

    await act(() =>
      result.current.register.mutateAsync({
        email: "ada@example.com",
        password: "correct horse battery",
        username: "ada",
      }),
    );

    await waitFor(() => expect(result.current.session.data).toEqual(session));
  });

  it("US-A02 AC-A02.3 logs out with the cached CSRF token", async () => {
    const apiClient = fakeClient();
    const { result } = renderWithSession(
      () => ({ logIn: useLogIn(), logOut: useLogOut(), session: useSession() }),
      apiClient,
    );
    await waitFor(() => expect(result.current.session.isSuccess).toBe(true));
    await act(() =>
      result.current.logIn.mutateAsync({
        email: "ada@example.com",
        password: "x",
      }),
    );

    await act(() => result.current.logOut.mutateAsync());

    expect(apiClient.logOut).toHaveBeenCalledWith(session.csrfToken);
  });

  it("logs out without a token when no session is cached", async () => {
    const apiClient = fakeClient();
    const { result } = renderWithSession(() => useLogOut(), apiClient);

    await act(() => result.current.mutateAsync());

    expect(apiClient.logOut).toHaveBeenCalledWith(null);
  });

  it("PROFILE-02 refuses an update without a cached session", async () => {
    const { result } = renderWithSession(
      () => ({ session: useSession(), update: useUpdateProfile("ada") }),
      fakeClient(),
    );
    await waitFor(() => expect(result.current.session.isSuccess).toBe(true));

    await expect(
      act(() => result.current.update.mutateAsync({ bio: "Analyst" })),
    ).rejects.toThrow("requires an authenticated session");
  });

  it("requires the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => renderHook(() => useSession())).toThrow("<SessionProvider>");
  });
});
