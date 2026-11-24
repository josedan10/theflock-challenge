import { describe, expect, it } from "vitest";

import { canonicalPublicUsername } from "./username.js";

describe("canonical public username", () => {
  it("US-A03 AC-A03.2 normalizes case and surrounding whitespace", () => {
    expect(canonicalPublicUsername("  Ada_Lovelace  ")).toBe("ada_lovelace");
    expect(canonicalPublicUsername("a".repeat(30))).toBe("a".repeat(30));
  });

  it.each([
    ["too short", "ab"],
    ["too long", "a".repeat(31)],
    ["starts with a digit", "1ada"],
    ["contains a hyphen", "ada-lovelace"],
    ["contains a space", "ada lovelace"],
    ["contains a quote", "ada' OR '1'='1"],
    ["contains a wildcard", "ada%"],
    ["is enormous", "a".repeat(61)],
    ["is empty", "   "],
  ])("US-A03 AC-A03.2 rejects %s", (_label, input) => {
    expect(canonicalPublicUsername(input)).toBeNull();
  });
});
