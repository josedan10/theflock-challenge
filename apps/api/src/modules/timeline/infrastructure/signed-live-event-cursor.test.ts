import { describe, expect, it } from "vitest";

import { InvalidTimelineCursorError } from "../application/read-timeline.js";

import { createLiveEventCursor } from "./signed-live-event-cursor.js";
import { createTimelineCursor } from "./signed-timeline-cursor.js";

const secret = "unit-test-cursor-key";
const position = {
  createdAt: "2026-11-24T12:00:00.789123Z",
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f99",
};
const viewer = "viewer-a";

describe("US-F01 AC-F01.4 live event ids", () => {
  it("cannot be replayed as a home-timeline page cursor", () => {
    const live = createLiveEventCursor(secret);
    const pages = createTimelineCursor(secret);
    const token = live.encode(viewer, position);
    expect(live.decode(viewer, token)).toEqual(position);
    expect(() => pages.decode(viewer, token)).toThrow(
      InvalidTimelineCursorError,
    );
    expect(() => live.decode(viewer, pages.encode(viewer, position))).toThrow(
      InvalidTimelineCursorError,
    );
    expect(() => live.decode("viewer-b", token)).toThrow(
      InvalidTimelineCursorError,
    );
  });
});
