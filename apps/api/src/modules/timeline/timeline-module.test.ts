import { describe, expect, it } from "vitest";

import { DEFAULT_TIMELINE_STREAM_RATE_LIMIT } from "./http/timeline-stream-routes.js";
import { DEFAULT_TIMELINE_READ_RATE_LIMIT } from "./timeline-module.js";

describe("US-B03 timeline read budget", () => {
  it("starts at 120 requests per minute per client address", () => {
    expect(DEFAULT_TIMELINE_READ_RATE_LIMIT).toEqual({
      max: 120,
      timeWindowMs: 60_000,
    });
  });
});

describe("US-F01 AC-F01.5 live stream budget", () => {
  it("starts at 30 opens per minute per client address", () => {
    expect(DEFAULT_TIMELINE_STREAM_RATE_LIMIT).toEqual({
      max: 30,
      timeWindowMs: 60_000,
    });
  });
});
