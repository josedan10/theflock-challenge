import { describe, expect, it } from "vitest";

import { followListPageSchema, followListQuerySchema } from "./follow-list";

const item = {
  followedByViewer: true,
  isViewer: false,
  user: {
    avatarUrl: null,
    displayName: "Grace",
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
    username: "grace",
  },
};

describe("follow list contract", () => {
  it("US-C03 AC-C03.1 accepts a page of members with viewer relationships", () => {
    expect(
      followListPageSchema.parse({ items: [item], nextCursor: "v1.a.b" }),
    ).toEqual({ items: [item], nextCursor: "v1.a.b" });
  });

  it("US-C03 AC-C03.2 accepts an empty last page", () => {
    expect(followListPageSchema.parse({ items: [], nextCursor: null })).toEqual(
      { items: [], nextCursor: null },
    );
  });

  it.each([
    ["a missing relationship", { isViewer: false, user: item.user }],
    ["an extra field", { ...item, email: "grace@example.com" }],
    [
      "an invalid username",
      { ...item, user: { ...item.user, username: "G!" } },
    ],
  ])("US-C03 AC-C03.1 rejects %s", (_case, candidate) => {
    expect(
      followListPageSchema.safeParse({ items: [candidate], nextCursor: null })
        .success,
    ).toBe(false);
  });

  it("US-C03 AC-C03.1 defaults and caps the page size", () => {
    expect(followListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(followListQuerySchema.parse({ limit: "500" }).limit).toBe(30);
    expect(followListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(followListQuerySchema.safeParse({ extra: "1" }).success).toBe(false);
  });
});
