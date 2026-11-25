import { describe, expect, it } from "vitest";

import { compactTime } from "./relative-time";

const now = new Date("2026-11-25T12:00:00.000Z");

describe("compactTime", () => {
  it.each([
    ["2026-11-25T11:59:30.000Z", "now"],
    ["2026-11-25T12:00:30.000Z", "now"],
    ["2026-11-25T11:55:00.000Z", "5m"],
    ["2026-11-25T09:00:00.000Z", "3h"],
  ])("US-B01 shows %s as %s", (iso, expected) => {
    expect(compactTime(iso, now)).toBe(expected);
  });

  it("US-B01 shows older tweets by date, with the year when it differs", () => {
    expect(compactTime("2026-11-20T12:00:00.000Z", now)).toMatch(/20/);
    expect(compactTime("2026-11-20T12:00:00.000Z", now)).not.toMatch(/2026/);
    expect(compactTime("2025-11-20T12:00:00.000Z", now)).toMatch(/2025/);
  });
});
