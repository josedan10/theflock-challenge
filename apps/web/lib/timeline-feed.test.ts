import { describe, expect, it } from "vitest";

import { testTweet } from "../components/test-utils";

import {
  assembleTimeline,
  dedupeTweets,
  restoreTweet,
  tweetSlot,
  tweetsAheadOfPage,
} from "./timeline-feed";

import type { Tweet } from "@twitter-clone/contracts";

const tweet = (id: string, createdAt: string, content = id): Tweet => ({
  ...testTweet,
  content,
  createdAt,
  id,
});

describe("timeline feed assembly (AC-B03.3)", () => {
  it("keeps the first copy when the next page repeats a tweet id", () => {
    const older = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb2",
      "2026-11-24T12:00:00.000Z",
      "older",
    );
    const newer = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb3",
      "2026-11-24T13:00:00.000Z",
      "newer",
    );
    const repeated = { ...newer, content: "stale copy" };

    expect(
      dedupeTweets([newer, older, repeated]).map((item) => item.content),
    ).toEqual(["newer", "older"]);
  });

  it("shows a post newer than the loaded page and hides one the cursor still covers", () => {
    const newest = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb3",
      "2026-11-24T13:00:00.000Z",
      "loaded",
    );
    const older = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb1",
      "2026-11-24T11:00:00.000Z",
      "behind cursor",
    );
    const fresh = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb4",
      "2026-11-24T14:00:00.000Z",
      "just posted",
    );

    expect(
      tweetsAheadOfPage([fresh, newest, older], [newest]).map(
        (item) => item.content,
      ),
    ).toEqual(["just posted"]);
  });

  it("keeps pending posts when the first page is still empty", () => {
    const pending = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb1",
      "2026-11-24T12:00:00.000Z",
      "mine",
    );

    expect(tweetsAheadOfPage([pending], []).map((item) => item.id)).toEqual([
      pending.id,
    ]);
  });

  it("breaks a createdAt tie by descending id", () => {
    const loaded = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb2",
      "2026-11-24T12:00:00.000Z",
    );
    const newerId = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb3",
      "2026-11-24T12:00:00.000Z",
      "higher id",
    );
    const olderId = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb1",
      "2026-11-24T12:00:00.000Z",
      "lower id",
    );

    expect(
      tweetsAheadOfPage([newerId, olderId], [loaded]).map(
        (item) => item.content,
      ),
    ).toEqual(["higher id"]);
  });

  it("omits tweets posted while reading older pages until the banner is accepted", () => {
    const loaded = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb2",
      "2026-11-24T12:00:00.000Z",
      "loaded",
    );
    const fresh = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb3",
      "2026-11-24T13:00:00.000Z",
      "fresh",
    );

    expect(
      assembleTimeline([fresh], [{ items: [loaded] }], false).map(
        (item) => item.content,
      ),
    ).toEqual(["loaded"]);
    expect(
      assembleTimeline([fresh], [{ items: [loaded] }], true).map(
        (item) => item.content,
      ),
    ).toEqual(["fresh", "loaded"]);
  });
});

describe("restoreTweet", () => {
  const first = tweet(
    "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb1",
    "2026-11-24T11:00:00.000Z",
    "one",
  );
  const second = tweet(
    "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb2",
    "2026-11-24T12:00:00.000Z",
    "two",
  );
  const third = tweet(
    "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb3",
    "2026-11-24T13:00:00.000Z",
    "three",
  );

  it("puts the tweet back under ids that were newer, including ones posted later", () => {
    const slot = tweetSlot([third, second, first], second.id);
    const later = tweet(
      "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb4",
      "2026-11-24T14:00:00.000Z",
      "four",
    );

    expect(slot).toBeDefined();
    expect(
      restoreTweet([later, third, first], slot as NonNullable<typeof slot>).map(
        (item) => item.content,
      ),
    ).toEqual(["four", "three", "two", "one"]);
  });

  it("leaves the list alone when the tweet is already there", () => {
    const slot = tweetSlot([second, first], second.id) as NonNullable<
      ReturnType<typeof tweetSlot>
    >;

    expect(restoreTweet([second, first], slot)).toEqual([second, first]);
  });
});
