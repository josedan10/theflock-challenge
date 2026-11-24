import { describe, expect, it } from "vitest";

import {
  TIMELINE_CURSOR_MAX_LENGTH,
  TIMELINE_DEFAULT_LIMIT,
  TIMELINE_MAX_LIMIT,
  timelineQuerySchema,
} from "./timeline";

describe("US-B03 AC-B03.4 timeline query", () => {
  it("defaults to 20 and caps valid positive limits at 30", () => {
    expect(timelineQuerySchema.parse({}).limit).toBe(TIMELINE_DEFAULT_LIMIT);
    expect(timelineQuerySchema.parse({ limit: "1" }).limit).toBe(1);
    expect(timelineQuerySchema.parse({ limit: "31" }).limit).toBe(
      TIMELINE_MAX_LIMIT,
    );
  });
  it.each([
    { limit: "" },
    { limit: "0" },
    { limit: "-1" },
    { limit: "1e2" },
    { limit: "2.1" },
    { limit: ["1", "2"] },
    { cursor: "" },
    { cursor: "x".repeat(TIMELINE_CURSOR_MAX_LENGTH + 1) },
    { viewer: "another" },
  ])("rejects invalid input %j", (params) => {
    expect(timelineQuerySchema.safeParse(params).success).toBe(false);
  });
});
