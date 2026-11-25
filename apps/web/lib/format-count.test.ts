import { describe, expect, it } from "vitest";

import { formatCount, formatExactCount } from "./format-count";

describe("formatCount", () => {
  it.each([
    [0, "0"],
    [12, "12"],
    [999, "999"],
    [1_000, "1k"],
    [1_049, "1k"],
    [1_100, "1.1k"],
    [1_999, "1.9k"],
    [12_345, "12.3k"],
    [999_999, "999.9k"],
    [1_000_000, "1M"],
    [2_345_678, "2.3M"],
    [999_999_999, "999.9M"],
    [1_000_000_000, "1B"],
    [4_560_000_000, "4.5B"],
  ])("PRO-02 shows %i as %s", (value, expected) => {
    expect(formatCount(value)).toBe(expected);
  });
});

describe("formatExactCount", () => {
  it("groups thousands", () => {
    expect(formatExactCount(2_345_678)).toBe("2,345,678");
  });
});
