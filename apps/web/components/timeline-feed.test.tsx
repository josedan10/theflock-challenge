import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import {
  fakeApiClient,
  renderWithSession,
  testSession,
  testTweet,
} from "./test-utils";
import { TimelineFeed } from "./timeline-feed";

import type { TimelinePage, Tweet } from "@twitter-clone/contracts";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

afterEach(() => {
  replace.mockReset();
  vi.unstubAllGlobals();
});

const tweet = (id: string, createdAt: string, content: string): Tweet => ({
  ...testTweet,
  content,
  createdAt,
  id,
});

const newer = tweet(
  "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f63",
  "2026-11-24T13:00:00.000Z",
  "newer",
);
const older = tweet(
  "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
  "2026-11-24T11:00:00.000Z",
  "older",
);

function renderFeed(
  apiClient: ReturnType<typeof fakeApiClient> = fakeApiClient({
    me: vi.fn(async () => testSession),
  }),
) {
  return renderWithSession(<TimelineFeed user={testSession.user} />, apiClient);
}

describe("TimelineFeed", () => {
  it("AC-B03.5 shows a loading status until the first page arrives", () => {
    renderFeed(
      fakeApiClient({
        getTimeline: vi.fn(() => new Promise<TimelinePage>(() => undefined)),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your timeline…",
    );
  });

  it("AC-B03.5 distinguishes an empty timeline from the end of a timeline", async () => {
    renderFeed();

    expect(
      await screen.findByText(
        "Your timeline is empty. Post a tweet above, or search for people and follow them to see their posts here.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find people" })).toHaveAttribute(
      "href",
      "/search",
    );
  });

  it("AC-B03.3 dedupes the next page and then says the feed has ended", async () => {
    const user = userEvent.setup();
    const repeated = { ...newer, content: "stale copy" };
    renderFeed(
      fakeApiClient({
        getTimeline: vi
          .fn()
          .mockResolvedValueOnce({ items: [newer], nextCursor: "cursor-2" })
          .mockResolvedValueOnce({
            items: [repeated, older],
            nextCursor: null,
          }),
      }),
    );

    expect(
      await screen.findByText("newer", { selector: "article p" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(
      await screen.findByText("older", { selector: "article p" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByText("stale copy")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "You've reached the end of your timeline.",
    );
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("AC-B03.5 retries a failed first page without offering an empty timeline", async () => {
    const user = userEvent.setup();
    renderFeed(
      fakeApiClient({
        getTimeline: vi
          .fn()
          .mockRejectedValueOnce(
            new ApiError(500, "INTERNAL_ERROR", "Something went wrong."),
          )
          .mockResolvedValueOnce({ items: [newer], nextCursor: null }),
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByText("newer", { selector: "article p" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Your timeline is empty/),
    ).not.toBeInTheDocument();
  });

  it("AC-B03.5 retries only the failed older page and keeps tweets already shown", async () => {
    const user = userEvent.setup();
    const getTimeline = vi
      .fn()
      .mockResolvedValueOnce({ items: [newer], nextCursor: "cursor-2" })
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "nope"))
      .mockResolvedValueOnce({ items: [older], nextCursor: null });
    renderFeed(fakeApiClient({ getTimeline }));

    expect(
      await screen.findByText("newer", { selector: "article p" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load older posts.",
    );
    expect(
      screen.getByText("newer", { selector: "article p" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByText("older", { selector: "article p" }),
    ).toBeInTheDocument();
    expect(getTimeline).toHaveBeenCalledTimes(3);
    expect(getTimeline).toHaveBeenNthCalledWith(2, "cursor-2");
    expect(getTimeline).toHaveBeenNthCalledWith(3, "cursor-2");
  });

  it("requests the next page once when the sentinel becomes visible", async () => {
    class FakeObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [];
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(): void {
        this.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this,
        );
      }
      disconnect(): void {
        // The effect drops the observer; nothing else needs releasing.
      }
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      unobserve(): void {
        // Sentinel observation ends with disconnect.
      }
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const getTimeline = vi
      .fn()
      .mockResolvedValueOnce({ items: [newer], nextCursor: "cursor-2" })
      .mockResolvedValueOnce({ items: [older], nextCursor: null });
    renderFeed(fakeApiClient({ getTimeline }));

    expect(
      await screen.findByText("older", { selector: "article p" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(getTimeline).toHaveBeenCalledTimes(2));
    expect(getTimeline).toHaveBeenNthCalledWith(2, "cursor-2");
  });

  it("sends the member to /login when the timeline read is unauthenticated", async () => {
    renderFeed(
      fakeApiClient({
        getTimeline: vi.fn(async () => {
          throw new ApiError(401, "UNAUTHENTICATED", "Sign in again.");
        }),
      }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
