import { describe, expect, it } from "vitest";

import { InvalidTimelineCursorError } from "../application/read-timeline.js";

import { createTimelineCursor } from "./signed-timeline-cursor.js";

const cursor = createTimelineCursor("unit-test-cursor-key");
const position = {
  createdAt: "2026-11-24T12:00:00.789123Z",
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f99",
};
const viewer = "viewer-a";

describe("US-B03 AC-B03.3/4 signed timeline positions", () => {
  it("preserves all six fractional digits and binds the position to this viewer and key", () => {
    const token = cursor.encode(viewer, position);
    expect(cursor.decode(viewer, token)).toEqual(position);
    expect(() => cursor.decode("viewer-b", token)).toThrow(
      InvalidTimelineCursorError,
    );
    expect(() => createTimelineCursor("changed").decode(viewer, token)).toThrow(
      InvalidTimelineCursorError,
    );
  });
  it("rejects changes at every byte, including the version, payload and signature", () => {
    const token = cursor.encode(viewer, position);
    for (let i = 0; i < token.length; i++) {
      const changed =
        token.slice(0, i) + (token[i] === "A" ? "B" : "A") + token.slice(i + 1);
      expect(() => cursor.decode(viewer, changed)).toThrow(
        InvalidTimelineCursorError,
      );
    }
    expect(() => cursor.decode(viewer, token + "x".repeat(256))).toThrow(
      InvalidTimelineCursorError,
    );
  });
  it.each([
    { ...position, createdAt: "2026-02-30T01:00:00.000000Z" },
    { ...position, id: "bad-uuid" },
  ])("rejects even a signed invalid position", (invalid) => {
    expect(() => cursor.decode(viewer, cursor.encode(viewer, invalid))).toThrow(
      InvalidTimelineCursorError,
    );
  });
});
