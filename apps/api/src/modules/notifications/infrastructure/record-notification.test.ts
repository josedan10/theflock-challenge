import { describe, expect, it } from "vitest";

import { notificationDedupeKey } from "./record-notification.js";

describe("notificationDedupeKey", () => {
  it("NOT-01 keys a follow by actor and recipient", () => {
    expect(
      notificationDedupeKey({ actorId: "a", recipientId: "r", type: "follow" }),
    ).toBe("follow:a:r");
  });

  it("NOT-01 keys a like by actor and tweet, so re-liking never repeats", () => {
    expect(
      notificationDedupeKey({
        actorId: "a",
        recipientId: "r",
        tweetId: "t",
        type: "like",
      }),
    ).toBe("like:a:t");
  });

  it("US-B05 keys a mention by the tweet and the person named", () => {
    expect(
      notificationDedupeKey({
        actorId: "a",
        recipientId: "r",
        tweetId: "t",
        type: "mention",
      }),
    ).toBe("mention:t:r");
  });

  it("NOT-01 keys a reply by the reply itself", () => {
    expect(
      notificationDedupeKey({
        actorId: "a",
        recipientId: "r",
        tweetId: "reply",
        type: "reply",
      }),
    ).toBe("reply:reply");
  });
});
