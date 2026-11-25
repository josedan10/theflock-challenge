import { describe, expect, it } from "vitest";

import { likeResponseSchema, likeStateSchema } from "./like";

describe("like state contract", () => {
  it("US-C02 AC-C02.1 accepts a committed liked state and count", () => {
    expect(
      likeResponseSchema.parse({ like: { likeCount: 1, liked: true } }),
    ).toEqual({ like: { likeCount: 1, liked: true } });
    expect(likeStateSchema.parse({ likeCount: 0, liked: false })).toEqual({
      likeCount: 0,
      liked: false,
    });
  });

  it.each([
    ["a negative count", { likeCount: -1, liked: true }],
    ["a fractional count", { likeCount: 1.5, liked: true }],
    ["a missing state", { likeCount: 1 }],
    ["an extra field", { extra: true, likeCount: 1, liked: true }],
  ])("US-C02 AC-C02.4 rejects %s", (_case, state) => {
    expect(likeStateSchema.safeParse(state).success).toBe(false);
  });
});
