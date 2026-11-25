import { describe, expect, it } from "vitest";

import {
  createSignedKeysetCursor,
  InvalidKeysetCursorError,
} from "../../../platform/pagination/signed-keyset-cursor.js";
import { FollowTargetNotFoundError } from "../domain/errors.js";

import { createListFollows } from "./list-follows.js";

import type { FollowListEntry, FollowListReader } from "./ports.js";

const GRACE = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61";
const VIEWER = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";

const entries: FollowListEntry[] = Array.from({ length: 5 }, (_, index) => ({
  createdAt: `2026-11-24T12:00:0${5 - index}.000000Z`,
  displayName: `Member ${index}`,
  followedByViewer: index % 2 === 0,
  id: index === 1 ? VIEWER : `0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f7${index}`,
  username: `member${index}`,
}));

function fakeReader() {
  const reads: Parameters<FollowListReader["readPage"]>[0][] = [];
  const reader: FollowListReader = {
    findMemberId: async (username) => (username === "grace" ? GRACE : null),
    readPage: async (input) => {
      reads.push(input);
      const start =
        input.before === null
          ? 0
          : entries.findIndex((entry) => entry.id === input.before?.id) + 1;
      return entries.slice(start, start + input.count);
    },
  };
  return { reader, reads };
}

const cursors = createSignedKeysetCursor("secret", "follow-list/cursor-key");

describe("list follows", () => {
  it("US-C03 AC-C03.1 pages a list with viewer relationships and no repeats", async () => {
    const { reader, reads } = fakeReader();
    const list = createListFollows({ cursors, reader });

    const first = await list({
      direction: "followers",
      limit: 2,
      username: "Grace",
      viewerId: VIEWER,
    });
    const second = await list({
      cursor: first.nextCursor ?? "",
      direction: "followers",
      limit: 2,
      username: "grace",
      viewerId: VIEWER,
    });
    const third = await list({
      cursor: second.nextCursor ?? "",
      direction: "followers",
      limit: 2,
      username: "grace",
      viewerId: VIEWER,
    });

    expect(first.items.map((item) => item.user.username)).toEqual([
      "member0",
      "member1",
    ]);
    expect(first.items[0]).toEqual({
      followedByViewer: true,
      isViewer: false,
      user: {
        avatarUrl: null,
        displayName: "Member 0",
        id: entries[0]?.id,
        username: "member0",
      },
    });
    expect(first.items[1]?.isViewer).toBe(true);
    expect(second.items.map((item) => item.user.username)).toEqual([
      "member2",
      "member3",
    ]);
    expect(third).toMatchObject({ nextCursor: null });
    expect(third.items.map((item) => item.user.username)).toEqual(["member4"]);
    expect(reads[0]).toMatchObject({
      before: null,
      count: 3,
      memberId: GRACE,
      viewerId: VIEWER,
    });
  });

  it("US-C03 AC-C03.2 returns an empty last page", async () => {
    const reader: FollowListReader = {
      findMemberId: async () => GRACE,
      readPage: async () => [],
    };

    await expect(
      createListFollows({ cursors, reader })({
        direction: "following",
        limit: 20,
        username: "grace",
        viewerId: null,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  it("US-C03 marks no row as the viewer when signed out", async () => {
    const { reader } = fakeReader();

    const page = await createListFollows({ cursors, reader })({
      direction: "followers",
      limit: 5,
      username: "grace",
      viewerId: null,
    });

    expect(page.items.some((item) => item.isViewer)).toBe(false);
  });

  it.each(["nobody", "not a username!"])(
    "US-C03 answers %s as an unknown member",
    async (username) => {
      const { reader } = fakeReader();

      await expect(
        createListFollows({ cursors, reader })({
          direction: "followers",
          limit: 20,
          username,
          viewerId: null,
        }),
      ).rejects.toBeInstanceOf(FollowTargetNotFoundError);
    },
  );

  it("US-C03 rejects a cursor from the other direction before reading", async () => {
    const { reader, reads } = fakeReader();
    const list = createListFollows({ cursors, reader });
    const followers = await list({
      direction: "followers",
      limit: 2,
      username: "grace",
      viewerId: null,
    });

    await expect(
      list({
        cursor: followers.nextCursor ?? "",
        direction: "following",
        limit: 2,
        username: "grace",
        viewerId: null,
      }),
    ).rejects.toBeInstanceOf(InvalidKeysetCursorError);
    expect(reads).toHaveLength(1);
  });
});
