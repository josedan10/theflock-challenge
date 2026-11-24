import { describe, expect, it } from "vitest";

import { DEFAULT_TIMELINE_READ_RATE_LIMIT } from "./timeline-module.js";

describe("US-B03 timeline read budget", () => {
  it("starts at 120 requests per minute per client address", () => {
    expect(DEFAULT_TIMELINE_READ_RATE_LIMIT).toEqual({
      max: 120,
      timeWindowMs: 60_000,
    });
  });
});
