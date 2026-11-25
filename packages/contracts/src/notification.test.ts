import { describe, expect, it } from "vitest";

import {
  markReadRequestSchema,
  notificationPageSchema,
  unreadCountResponseSchema,
} from "./notification";

const actor = {
  avatarUrl: null,
  displayName: "Grace",
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
  username: "grace",
};
const base = {
  actor,
  createdAt: "2026-11-25T12:00:00.000Z",
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f70",
  read: false,
};

describe("notification contract", () => {
  it("NOT-01 accepts follow, like and reply notifications", () => {
    const tweet = {
      content: "hi",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f71",
    };
    const page = {
      items: [
        { ...base, tweet: null, type: "follow" },
        { ...base, tweet, type: "like" },
        { ...base, read: true, tweet, type: "reply" },
        { ...base, tweet, type: "mention" },
      ],
      nextCursor: null,
    };

    expect(notificationPageSchema.parse(page)).toEqual(page);
  });

  it.each([
    ["an unknown type", { ...base, tweet: null, type: "quote" }],
    [
      "an extra field",
      { ...base, email: "x@y.z", tweet: null, type: "follow" },
    ],
    [
      "a missing read state",
      {
        actor,
        createdAt: base.createdAt,
        id: base.id,
        tweet: null,
        type: "follow",
      },
    ],
  ])("NOT-01 rejects %s", (_case, item) => {
    expect(
      notificationPageSchema.safeParse({ items: [item], nextCursor: null })
        .success,
    ).toBe(false);
  });

  it("NOT-01 counts unread as a non-negative integer", () => {
    expect(unreadCountResponseSchema.parse({ unreadCount: 3 })).toEqual({
      unreadCount: 3,
    });
    expect(
      unreadCountResponseSchema.safeParse({ unreadCount: -1 }).success,
    ).toBe(false);
  });

  it("NOT-01 marks specific ids or everything, nothing else", () => {
    expect(markReadRequestSchema.parse({ all: true })).toEqual({ all: true });
    expect(markReadRequestSchema.parse({ ids: [base.id] })).toEqual({
      ids: [base.id],
    });
    for (const body of [
      {},
      { all: false },
      { ids: [] },
      { ids: ["not-a-uuid"] },
      { ids: Array.from({ length: 51 }, () => base.id) },
      { all: true, ids: [base.id] },
    ]) {
      expect(markReadRequestSchema.safeParse(body).success).toBe(false);
    }
  });
});
