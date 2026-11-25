import { describe, expect, it, vi } from "vitest";

import { createSearchUsers } from "./search-users.js";

import type { UserSearcher } from "./ports.js";

const VIEWER = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";
const GRACE = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61";

describe("search users", () => {
  it("US-D01 AC-D01.1 lowercases the text and maps public fields only", async () => {
    const search = vi.fn<UserSearcher["search"]>(async () => [
      {
        displayName: "Grace",
        followedByViewer: true,
        id: GRACE,
        username: "grace",
      },
      {
        displayName: "Ada",
        followedByViewer: false,
        id: VIEWER,
        username: "ada",
      },
    ]);

    const result = await createSearchUsers({ search })({
      limit: 20,
      text: "GrA",
      viewerId: VIEWER,
    });

    expect(search).toHaveBeenCalledWith({
      limit: 20,
      text: "gra",
      viewerId: VIEWER,
    });
    expect(result).toEqual({
      items: [
        {
          followedByViewer: true,
          isViewer: false,
          user: {
            avatarUrl: null,
            displayName: "Grace",
            id: GRACE,
            username: "grace",
          },
        },
        {
          followedByViewer: false,
          isViewer: true,
          user: {
            avatarUrl: null,
            displayName: "Ada",
            id: VIEWER,
            username: "ada",
          },
        },
      ],
    });
  });
});
