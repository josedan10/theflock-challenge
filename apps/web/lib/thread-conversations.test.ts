import { describe, expect, it } from "vitest";

import { testTweet } from "../components/test-utils";

import { buildConversations } from "./thread-conversations";

import type { ThreadItem } from "@twitter-clone/contracts";

const tweet = (
  id: string,
  parentTweetId: string | null,
  username = id,
): ThreadItem => ({
  ...testTweet,
  author: { ...testTweet.author, username },
  id,
  parentTweetId,
});

const shape = (groups: ReturnType<typeof buildConversations>) =>
  groups.map((group) =>
    group.map(({ connectAbove, connectBelow, item, replyingTo }) => ({
      above: connectAbove,
      below: connectBelow,
      id: item.id,
      to: replyingTo,
    })),
  );

describe("buildConversations", () => {
  const root = tweet("root", null);

  it("US-B04 starts a conversation per direct reply and chains its replies", () => {
    const groups = buildConversations(root, [
      tweet("a", "root"),
      tweet("b", "root"),
      tweet("a1", "a"),
      tweet("a1x", "a1"),
    ]);

    expect(shape(groups)).toEqual([
      [
        { above: false, below: true, id: "a", to: null },
        { above: true, below: true, id: "a1", to: null },
        { above: true, below: false, id: "a1x", to: null },
      ],
      [{ above: false, below: false, id: "b", to: null }],
    ]);
  });

  it("US-B04 names the parent when a sibling reply sits in between", () => {
    const groups = buildConversations(root, [
      tweet("a", "root"),
      tweet("a1", "a"),
      tweet("a2", "a"),
    ]);

    expect(shape(groups)).toEqual([
      [
        { above: false, below: true, id: "a", to: null },
        { above: true, below: false, id: "a1", to: null },
        { above: false, below: false, id: "a2", to: "a" },
      ],
    ]);
  });

  it("US-B04 lets a reply whose parent is not loaded start its own conversation", () => {
    const groups = buildConversations(root, [tweet("late", "unloaded")]);

    expect(shape(groups)).toEqual([
      [{ above: false, below: false, id: "late", to: null }],
    ]);
  });

  it("US-B04 has no conversations without replies", () => {
    expect(buildConversations(root, [])).toEqual([]);
  });
});
