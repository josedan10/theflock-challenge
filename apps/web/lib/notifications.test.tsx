import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { fakeApiClient, testSession } from "../components/test-utils";

import { ApiError } from "./api-client";
import {
  useMarkNotificationsRead,
  useNotifications,
  useUnreadCount,
} from "./notifications";
import { SessionProvider, useSession } from "./session";

import type { ApiClient } from "./api-client";
import type { Notification } from "@twitter-clone/contracts";
import type { ReactNode } from "react";

const notice = (id: string, read = false): Notification => ({
  actor: {
    avatarUrl: null,
    displayName: "Grace",
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
    username: "grace",
  },
  createdAt: "2026-11-25T12:00:00.000Z",
  id,
  read,
  tweet: null,
  type: "follow",
});

function render(apiClient: ApiClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionProvider apiClient={apiClient}>{children}</SessionProvider>
  );
  return renderHook(
    () => ({
      count: useUnreadCount(testSession.user.id),
      list: useNotifications(testSession.user.id),
      mark: useMarkNotificationsRead(testSession.user.id),
      session: useSession(),
    }),
    { wrapper },
  );
}

async function ready(apiClient: ApiClient) {
  const view = render(apiClient);
  await waitFor(() => {
    expect(view.result.current.session.data).toEqual(testSession);
    expect(view.result.current.list.isSuccess).toBe(true);
    expect(view.result.current.count.isSuccess).toBe(true);
  });
  return view;
}

const items = (view: Awaited<ReturnType<typeof ready>>) =>
  view.result.current.list.data?.pages.flatMap((page) => page.items) ?? [];

describe("notification hooks", () => {
  it("NOT-01 does not ask for a count when signed out", () => {
    const getUnreadCount = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SessionProvider apiClient={fakeApiClient({ getUnreadCount })}>
        {children}
      </SessionProvider>
    );
    renderHook(() => useUnreadCount(null), { wrapper });

    expect(getUnreadCount).not.toHaveBeenCalled();
  });

  it("NOT-01 marks one read at once and settles on the committed count", async () => {
    let resolve: (value: { unreadCount: number }) => void = () => undefined;
    const markNotificationsRead = vi.fn(
      () =>
        new Promise<{ unreadCount: number }>((done) => {
          resolve = done;
        }),
    );
    const view = await ready(
      fakeApiClient({
        getNotifications: vi.fn(async () => ({
          items: [notice("n1"), notice("n2")],
          nextCursor: null,
        })),
        getUnreadCount: vi.fn(async () => ({ unreadCount: 2 })),
        markNotificationsRead,
        me: vi.fn(async () => testSession),
      }),
    );

    act(() => view.result.current.mark.mutate({ ids: ["n1"] }));

    await waitFor(() =>
      expect(items(view).map((item) => item.read)).toEqual([true, false]),
    );
    expect(view.result.current.count.data?.unreadCount).toBe(1);
    expect(markNotificationsRead).toHaveBeenCalledWith(
      { ids: ["n1"] },
      testSession.csrfToken,
    );
    act(() => resolve({ unreadCount: 5 }));
    await waitFor(() =>
      expect(view.result.current.count.data?.unreadCount).toBe(5),
    );
  });

  it("NOT-01 rolls back a failed mark-all", async () => {
    const view = await ready(
      fakeApiClient({
        getNotifications: vi.fn(async () => ({
          items: [notice("n1"), notice("n2", true)],
          nextCursor: null,
        })),
        getUnreadCount: vi.fn(async () => ({ unreadCount: 1 })),
        markNotificationsRead: vi.fn(async () => {
          throw new ApiError(0, "NETWORK_ERROR", "Offline.");
        }),
        me: vi.fn(async () => testSession),
      }),
    );

    act(() => view.result.current.mark.mutate({ all: true }));

    await waitFor(() => expect(view.result.current.mark.isError).toBe(true));
    expect(items(view).map((item) => item.read)).toEqual([false, true]);
    expect(view.result.current.count.data?.unreadCount).toBe(1);
  });
});
