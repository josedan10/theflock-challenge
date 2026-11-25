import { describe, expect, it, vi } from "vitest";

import { createTimelineLiveHub } from "./timeline-live-hub.js";

import type { LiveTimelineTweet } from "./timeline-live-hub.js";

const tweet = (id: string, authorId = "author"): LiveTimelineTweet => ({
  authorId,
  createdAt: "2026-11-24T12:00:00.000000Z",
  tweetId: id,
});

describe("US-F01 live hub", () => {
  it("AC-F01.1/4 delivers only to listed recipients, including every connection", () => {
    const hub = createTimelineLiveHub();
    const ada = { close: vi.fn(), push: vi.fn() };
    const adaTab = { close: vi.fn(), push: vi.fn() };
    const bob = { close: vi.fn(), push: vi.fn() };
    hub.subscribe("ada", ada);
    hub.subscribe("ada", adaTab);
    hub.subscribe("bob", bob);

    hub.deliver(tweet("t1"), new Set(["ada"]));

    expect(ada.push).toHaveBeenCalledWith(tweet("t1"));
    expect(adaTab.push).toHaveBeenCalledWith(tweet("t1"));
    expect(bob.push).not.toHaveBeenCalled();
  });

  it("AC-F01.3 unsubscribe and close stop further delivery", () => {
    const hub = createTimelineLiveHub();
    const ada = { close: vi.fn(), push: vi.fn() };
    const leave = hub.subscribe("ada", ada);
    leave();
    hub.deliver(tweet("t1"), new Set(["ada"]));
    expect(ada.push).not.toHaveBeenCalled();

    const other = { close: vi.fn(), push: vi.fn() };
    hub.subscribe("bob", other);
    hub.close();
    expect(other.close).toHaveBeenCalledOnce();
    expect(hub.connectionCount("bob")).toBe(0);
  });

  it("evicts the oldest connection when a viewer exceeds the cap", () => {
    const hub = createTimelineLiveHub(1);
    const first = { close: vi.fn(), push: vi.fn() };
    const second = { close: vi.fn(), push: vi.fn() };
    hub.subscribe("ada", first);
    hub.subscribe("ada", second);
    expect(first.close).toHaveBeenCalledOnce();
    expect(hub.connectionCount("ada")).toBe(1);

    hub.deliver(tweet("t1"), new Set(["ada"]));
    expect(first.push).not.toHaveBeenCalled();
    expect(second.push).toHaveBeenCalledOnce();
  });
});
