import { describe, expect, it } from "vitest";

import {
  createSignedKeysetCursor,
  InvalidKeysetCursorError,
} from "../../../platform/pagination/signed-keyset-cursor.js";
import { ProfileNotFoundError } from "../domain/errors.js";

import { createListProfilePosts } from "./list-profile-posts.js";

import type {
  ProfilePostRow,
  ProfilePostsReader,
} from "./list-profile-posts.js";

const ADA = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";
const OTHER = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f70";

const rows: ProfilePostRow[] = Array.from({ length: 3 }, (_, index) => ({
  author: {
    avatarUrl: null,
    displayName: "Ada",
    id: ADA,
    username: "ada",
  },
  content: `post ${index}`,
  createdAt: `2026-11-24T12:00:0${3 - index}.000000Z`,
  id: `0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f6${index}`,
  image: null,
  likeCount: index,
  likedByViewer: index === 0,
  replyCount: 0,
  replyingTo: index === 2 ? "grace" : null,
}));

function fakeReader() {
  const reads: Parameters<ProfilePostsReader["readPage"]>[0][] = [];
  const reader: ProfilePostsReader = {
    findMemberId: async (username) => (username === "ada" ? ADA : null),
    readPage: async (input) => {
      reads.push(input);
      const start =
        input.before === null
          ? 0
          : rows.findIndex((row) => row.id === input.before?.id) + 1;
      return rows.slice(start, start + input.count);
    },
  };
  return { reader, reads };
}

const cursors = createSignedKeysetCursor("secret", "profile-posts/cursor-key");

describe("list profile posts", () => {
  it("PROFILE-03 AC-A03.4 pages tweets and replies without repeating the anchor", async () => {
    const { reader, reads } = fakeReader();
    const list = createListProfilePosts({ cursors, reader });

    const first = await list({ limit: 2, username: "Ada", viewerId: null });
    const second = await list({
      cursor: first.nextCursor ?? "",
      limit: 2,
      username: "ada",
      viewerId: null,
    });

    expect(first.items.map((item) => item.content)).toEqual([
      "post 0",
      "post 1",
    ]);
    expect(first.items[1]?.replyingTo).toBeNull();
    expect(second.items.map((item) => item.replyingTo)).toEqual(["grace"]);
    expect(second.nextCursor).toBeNull();
    expect(reads[0]).toMatchObject({
      authorId: ADA,
      before: null,
      count: 3,
      viewerId: null,
    });
    expect(reads[1]?.before?.id).toBe(rows[1]?.id);
  });

  it("AC-A03.4 returns an empty page when the member has no posts", async () => {
    const reader: ProfilePostsReader = {
      findMemberId: async () => ADA,
      readPage: async () => [],
    };

    await expect(
      createListProfilePosts({ cursors, reader })({
        limit: 20,
        username: "ada",
        viewerId: null,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  it.each(["nobody", "not a username!"])(
    "AC-A03.2 answers %s as an unknown profile",
    async (username) => {
      const { reader, reads } = fakeReader();

      await expect(
        createListProfilePosts({ cursors, reader })({
          limit: 20,
          username,
          viewerId: null,
        }),
      ).rejects.toBeInstanceOf(ProfileNotFoundError);
      expect(reads).toHaveLength(0);
    },
  );

  it("AC-A03.4 rejects another member's cursor before reading", async () => {
    const { reader, reads } = fakeReader();
    const list = createListProfilePosts({ cursors, reader });
    const foreign = cursors.encode(OTHER, {
      createdAt: "2026-11-24T12:00:03.000000Z",
      id: rows[0]?.id ?? OTHER,
    });

    await expect(
      list({ cursor: foreign, limit: 2, username: "ada", viewerId: null }),
    ).rejects.toBeInstanceOf(InvalidKeysetCursorError);
    expect(reads).toHaveLength(0);
  });
});
