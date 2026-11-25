import { describe, expect, it } from "vitest";

import { followRelationshipSchema, followResponseSchema } from "./follow";

describe("follow relationship contract", () => {
  it("US-C01 AC-C01.1 accepts a committed following state and count", () => {
    expect(
      followResponseSchema.parse({
        relationship: { followerCount: 1, following: true },
      }),
    ).toEqual({ relationship: { followerCount: 1, following: true } });
    expect(
      followRelationshipSchema.parse({ followerCount: 0, following: false }),
    ).toEqual({ followerCount: 0, following: false });
  });

  it.each([
    ["a negative count", { followerCount: -1, following: true }],
    ["a fractional count", { followerCount: 1.5, following: true }],
    ["a missing state", { followerCount: 1 }],
    ["an extra field", { extra: true, followerCount: 1, following: true }],
  ])("US-C01 AC-C01.1 rejects %s", (_case, relationship) => {
    expect(followRelationshipSchema.safeParse(relationship).success).toBe(
      false,
    );
  });
});
