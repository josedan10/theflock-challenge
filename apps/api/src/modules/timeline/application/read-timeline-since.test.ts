import { describe, expect, it, vi } from "vitest";

import { createReadTimelineSince } from "./read-timeline-since.js";

import type { TimelineEntry } from "./read-timeline.js";

const after = {
  createdAt: "2026-11-24T12:00:00.000000Z",
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
};

const entry = (id: string): TimelineEntry => ({
  author: {
    avatarUrl: null,
    displayName: "Ada",
    id: "author",
    username: "ada",
  },
  content: id,
  createdAt: "2026-11-24T12:00:01.000000Z",
  id,
  image: null,
  likeCount: 0,
  likedByViewer: false,
  replyCount: 0,
});

describe("US-F01 AC-F01.3 catch-up page", () => {
  it("returns the bounded window and whether more were visible", async () => {
    const readRows = vi.fn(async () => [entry("a"), entry("b"), entry("c")]);
    const read = createReadTimelineSince(readRows);

    await expect(read("viewer", after, 2)).resolves.toEqual({
      items: [entry("a"), entry("b")],
      truncated: true,
    });
    expect(readRows).toHaveBeenCalledWith("viewer", after, 3);

    readRows.mockResolvedValueOnce([entry("a")]);
    await expect(read("viewer", after, 2)).resolves.toEqual({
      items: [entry("a")],
      truncated: false,
    });
  });
});
