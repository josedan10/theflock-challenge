import { describe, expect, it } from "vitest";

import { escapeLikePattern } from "./drizzle-user-search.js";

describe("escapeLikePattern", () => {
  it.each([
    ["ada", "ada"],
    ["50%", "50\\%"],
    ["a_b", "a\\_b"],
    ["back\\slash", "back\\\\slash"],
    ["\\%_", "\\\\\\%\\_"],
  ])("US-D01 AC-D01.4 escapes %s", (input, expected) => {
    expect(escapeLikePattern(input)).toBe(expected);
  });
});
