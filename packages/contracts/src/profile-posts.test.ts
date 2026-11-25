import { describe, expect, it } from "vitest";

import {
  profilePostsPageSchema,
  profilePostsQuerySchema,
} from "./profile-posts";
import { TIMELINE_DEFAULT_LIMIT, TIMELINE_MAX_LIMIT } from "./timeline";

const post = {
  author: {
    avatarUrl: null,
    displayName: "Ada",
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
    username: "ada",
  },
  content: "Hello",
  createdAt: "2026-11-24T12:00:00.000000Z",
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
  image: null,
  likeCount: 0,
  likedByViewer: false,
  replyCount: 0,
  replyingTo: null,
};

describe("profile posts contract", () => {
  it("PROFILE-03 AC-A03.4 accepts a reply card and rejects an unknown page field", () => {
    expect(
      profilePostsPageSchema.parse({
        items: [{ ...post, replyingTo: "grace" }],
        nextCursor: null,
      }).items[0]?.replyingTo,
    ).toBe("grace");
    expect(
      profilePostsPageSchema.safeParse({
        extra: true,
        items: [post],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });

  it("AC-A03.4 uses the timeline page size, including the default and the cap", () => {
    expect(profilePostsQuerySchema.parse({}).limit).toBe(
      TIMELINE_DEFAULT_LIMIT,
    );
    expect(profilePostsQuerySchema.parse({ limit: "100" }).limit).toBe(
      TIMELINE_MAX_LIMIT,
    );
    expect(profilePostsQuerySchema.safeParse({ limit: "0" }).success).toBe(
      false,
    );
  });
});
