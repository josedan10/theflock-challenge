import { describe, expect, it } from "vitest";

import { userSearchQuerySchema, userSearchResponseSchema } from "./search";

describe("user search contract", () => {
  it("US-D01 AC-D01.1 trims the query and defaults the limit", () => {
    expect(userSearchQuerySchema.parse({ q: "  ada  " })).toEqual({
      limit: 20,
      q: "ada",
    });
    expect(userSearchQuerySchema.parse({ limit: "99", q: "ad" }).limit).toBe(
      30,
    );
  });

  it("US-D01 AC-D01.4 keeps SQL wildcard characters as literal text", () => {
    expect(userSearchQuerySchema.parse({ q: "50%_off\\" }).q).toBe("50%_off\\");
  });

  it("US-D01 AC-D01.1 counts emoji as one character", () => {
    expect(userSearchQuerySchema.safeParse({ q: "👩‍💻" }).success).toBe(true);
    expect(userSearchQuerySchema.safeParse({ q: "😀" }).success).toBe(false);
  });

  it.each([
    ["a missing query", {}],
    ["one character", { q: "a" }],
    ["spaces around one character", { q: "  a  " }],
    ["51 characters", { q: "a".repeat(51) }],
    ["a null character", { q: "a\u0000b" }],
    ["a zero limit", { limit: "0", q: "ada" }],
    ["an unknown parameter", { q: "ada", sort: "name" }],
  ])("US-D01 AC-D01.4 rejects %s", (_case, query) => {
    expect(userSearchQuerySchema.safeParse(query).success).toBe(false);
  });

  it("US-D01 AC-D01.3 accepts public fields only", () => {
    const user = {
      avatarUrl: null,
      displayName: "Ada",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
      username: "ada",
    };
    const item = { followedByViewer: false, isViewer: false, user };

    expect(userSearchResponseSchema.parse({ items: [item] })).toEqual({
      items: [item],
    });
    const parsed = userSearchResponseSchema.parse({
      items: [{ ...item, user: { ...user, email: "ada@example.com" } }],
    });
    expect(parsed.items[0]?.user).not.toHaveProperty("email");
  });
});
