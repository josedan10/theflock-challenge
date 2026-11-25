import { describe, expect, it } from "vitest";

import {
  TIMELINE_CURSOR_MAX_LENGTH,
  TIMELINE_DEFAULT_LIMIT,
  TIMELINE_LIVE_CATCHUP_LIMIT,
  TIMELINE_LIVE_EVENT,
  TIMELINE_MAX_LIMIT,
  timelineItemSchema,
  timelineLiveEventSchema,
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

describe("US-B03 timeline card", () => {
  const card = {
    author: {
      avatarUrl: null,
      displayName: "Ada",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
      username: "ada",
    },
    content: "The reply",
    createdAt: "2026-11-24T12:00:00.000Z",
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
    image: null,
    likeCount: 0,
    likedByViewer: false,
    replyCount: 0,
    replyingTo: {
      content: "The original",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f62",
      username: "grace",
    },
  };

  it("keeps the parent text and drops a hidden parent author", () => {
    expect(timelineItemSchema.parse(card)).toEqual(card);
    expect(
      timelineItemSchema.parse({
        ...card,
        replyingTo: { ...card.replyingTo, username: null },
      }).replyingTo?.username,
    ).toBeNull();
    expect(
      timelineItemSchema.parse({ ...card, replyingTo: null }).replyingTo,
    ).toBeNull();
  });
});

describe("US-F01 live timeline event", () => {
  it("AC-F01.1 names the event and accepts only a tweet id", () => {
    expect(TIMELINE_LIVE_EVENT).toBe("timeline.tweet");
    expect(TIMELINE_LIVE_CATCHUP_LIMIT).toBe(TIMELINE_MAX_LIMIT);
    expect(
      timelineLiveEventSchema.parse({
        tweetId: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
      }),
    ).toEqual({ tweetId: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61" });
  });

  it.each([
    { tweetId: "not-a-uuid" },
    { tweetId: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61", content: "secret" },
    {},
  ])("rejects extra or invalid live payloads %j", (payload) => {
    expect(timelineLiveEventSchema.safeParse(payload).success).toBe(false);
  });
});
