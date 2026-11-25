import { describe, expect, it, vi } from "vitest";

import {
  createSignedKeysetCursor,
  InvalidKeysetCursorError,
} from "../../../platform/pagination/signed-keyset-cursor.js";

import { createNotificationUseCases } from "./notification-use-cases.js";

import type { NotificationEntry, NotificationStore } from "./ports.js";

const ADA = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";
const GRACE = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61";
const NOW = new Date("2026-11-25T12:00:00.000Z");

const entries: NotificationEntry[] = Array.from({ length: 3 }, (_, i) => ({
  actor: { displayName: "Grace", id: GRACE, username: "grace" },
  createdAt: `2026-11-25T11:00:0${3 - i}.000000Z`,
  id: `0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f7${i}`,
  read: i === 2,
  tweet:
    i === 0
      ? null
      : { content: "hi", id: `0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f8${i}` },
  type: i === 0 ? "follow" : "like",
}));

function fakeStore(): NotificationStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    markAllRead: vi.fn(async () => {
      calls.push("all");
    }),
    markRead: vi.fn(async (_recipient, ids) => {
      calls.push(`ids:${ids.join(",")}`);
    }),
    page: vi.fn(async (_recipient, before, count) => {
      const start =
        before === null ? 0 : entries.findIndex((e) => e.id === before.id) + 1;
      return entries.slice(start, start + count);
    }),
    unreadCount: vi.fn(async () => 2),
  };
}

const cursors = createSignedKeysetCursor("secret", "notifications/cursor-key");

describe("notification use cases", () => {
  it("NOT-01 pages newest first with a cursor bound to the recipient", async () => {
    const store = fakeStore();
    const cases = createNotificationUseCases({
      clock: () => NOW,
      cursors,
      store,
    });

    const first = await cases.list(ADA, 2);
    const second = await cases.list(ADA, 2, first.nextCursor ?? "");

    expect(first.items.map((item) => item.type)).toEqual(["follow", "like"]);
    expect(first.items[0]).toMatchObject({
      actor: { avatarUrl: null, username: "grace" },
      read: false,
      tweet: null,
    });
    expect(second.items.map((item) => item.read)).toEqual([true]);
    expect(second.nextCursor).toBeNull();
    await expect(
      cases.list(GRACE, 2, first.nextCursor ?? ""),
    ).rejects.toBeInstanceOf(InvalidKeysetCursorError);
  });

  it("NOT-01 marks ids or everything, then returns the committed unread count", async () => {
    const store = fakeStore();
    const cases = createNotificationUseCases({
      clock: () => NOW,
      cursors,
      store,
    });

    await expect(cases.markRead(ADA, { ids: ["a", "b"] })).resolves.toBe(2);
    await expect(cases.markRead(ADA, { all: true })).resolves.toBe(2);

    expect(store.calls).toEqual(["ids:a,b", "all"]);
    expect(store.markAllRead).toHaveBeenCalledWith(ADA, NOW);
  });
});
