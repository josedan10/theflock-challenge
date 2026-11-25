import { describe, expect, it } from "vitest";

import { formatUtcMicroseconds } from "./utc-microseconds.js";

describe("formatUtcMicroseconds", () => {
  it("pads millisecond instants to six fractional digits", () => {
    expect(formatUtcMicroseconds(new Date("2026-11-24T12:00:00.000Z"))).toBe(
      "2026-11-24T12:00:00.000000Z",
    );
    expect(formatUtcMicroseconds(new Date("2026-11-24T12:00:00.123Z"))).toBe(
      "2026-11-24T12:00:00.123000Z",
    );
  });
});
