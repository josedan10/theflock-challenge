import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import { HomeView } from "./home-view";
import {
  fakeApiClient,
  renderWithSession,
  testSession,
  testTweet,
} from "./test-utils";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  replace.mockReset();
});

const signedIn = () => fakeApiClient({ me: vi.fn(async () => testSession) });

describe("HomeView", () => {
  it("US-A02 AC-A02.4 shows a loading status until the session resolves", () => {
    renderWithSession(
      <HomeView />,
      fakeApiClient({
        me: vi.fn(
          () => new Promise<typeof testSession | null>(() => undefined),
        ),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your account…",
    );
  });

  it("US-A02 AC-A02.4 shows the member after /me confirms the session", async () => {
    renderWithSession(<HomeView />, signedIn());

    expect(
      await screen.findByRole("heading", { name: "Welcome, Ada" }),
    ).toBeInTheDocument();
    expect(screen.getByText("@ada")).toBeInTheDocument();
  });

  it("US-A02 AC-A02.4 sends a signed-out visitor to /login", async () => {
    renderWithSession(<HomeView />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(
      screen.queryByRole("button", { name: "Log out" }),
    ).not.toBeInTheDocument();
  });

  it("offers a retry when the session cannot be loaded", async () => {
    const me = vi
      .fn<() => Promise<typeof testSession | null>>()
      .mockRejectedValueOnce(
        new ApiError(500, "INTERNAL_ERROR", "Something went wrong."),
      )
      .mockResolvedValueOnce(testSession);
    renderWithSession(<HomeView />, fakeApiClient({ me }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { name: "Welcome, Ada" }),
    ).toBeInTheDocument();
  });
});

describe("HomeView tweets", () => {
  const post = async (content: string) => {
    fireEvent.change(
      await screen.findByRole("textbox", { name: "What's happening?" }),
      {
        target: { value: content },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    // The textarea also contains the text; wait for the posted card itself.
    // Posting holds a short spinner before the card is allowed to appear.
    await screen.findByText(
      content,
      { selector: "article p" },
      { timeout: 3_000 },
    );
  };

  it("TWT-02 offers the composer and invites a first post", async () => {
    renderWithSession(<HomeView />, signedIn());

    expect(
      await screen.findByRole("textbox", { name: "What's happening?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Your timeline is empty. Post a tweet above, or search for people and follow them to see their posts here.",
      ),
    ).toBeInTheDocument();
  });

  it("US-B01 AC-B01.1 lists new posts newest first", async () => {
    const apiClient = fakeApiClient({
      createTweet: vi.fn(async (input: { content: string }) => ({
        tweet: {
          ...testTweet,
          content: input.content,
          id: `id-${input.content}`,
        },
      })),
      me: vi.fn(async () => testSession),
    });
    renderWithSession(<HomeView />, apiClient);

    await post("one");
    await post("two");

    const items = within(
      screen.getByRole("list", { name: "Home" }),
    ).getAllByRole("article");
    expect(
      items.map(
        (item) => item.querySelector("p.whitespace-pre-wrap")?.textContent,
      ),
    ).toEqual(["two", "one"]);
  });

  it("US-B02 AC-B02.3 restores a tweet whose delete fails, explains it, and refocuses Delete", async () => {
    const apiClient = fakeApiClient({
      deleteTweet: vi.fn(async () => {
        throw new ApiError(
          0,
          "NETWORK_ERROR",
          "Can't reach the server. Check your connection and try again.",
        );
      }),
      me: vi.fn(async () => testSession),
    });
    renderWithSession(<HomeView />, apiClient);
    const user = userEvent.setup();
    await post("keep me");

    await user.click(screen.getByRole("button", { name: "Delete tweet" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const card = (
      await screen.findByText("keep me", { selector: "article p" })
    ).closest("article") as HTMLElement;
    await waitFor(() =>
      expect(within(card).getByRole("alert")).toHaveTextContent(
        "We couldn't delete this tweet.",
      ),
    );
    await waitFor(() =>
      expect(
        within(card).getByRole("button", { name: "Delete tweet" }),
      ).toHaveFocus(),
    );
    expect(apiClient.deleteTweet).toHaveBeenCalledWith(
      testTweet.id,
      testSession.csrfToken,
    );
  });

  it("US-B02 keeps a tweet removed, with no error, when it was already deleted elsewhere", async () => {
    const apiClient = fakeApiClient({
      deleteTweet: vi.fn(async () => {
        throw new ApiError(404, "NOT_FOUND", "That tweet does not exist.");
      }),
      me: vi.fn(async () => testSession),
    });
    renderWithSession(<HomeView />, apiClient);
    const user = userEvent.setup();
    await post("gone elsewhere");

    await user.click(screen.getByRole("button", { name: "Delete tweet" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(apiClient.deleteTweet).toHaveBeenCalled());
    expect(
      await screen.findByText(
        "Your timeline is empty. Post a tweet above, or search for people and follow them to see their posts here.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("AC-B03.5 holds a new post behind a banner after older pages are loaded", async () => {
    const loaded = {
      ...testTweet,
      content: "loaded",
      createdAt: "2026-11-24T12:00:00.000Z",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f62",
    };
    const older = {
      ...testTweet,
      content: "older",
      createdAt: "2026-11-24T11:00:00.000Z",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
    };
    const fresh = {
      ...testTweet,
      content: "fresh",
      createdAt: "2026-11-24T14:00:00.000Z",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f64",
    };
    const apiClient = fakeApiClient({
      createTweet: vi.fn(async () => ({ tweet: fresh })),
      getTimeline: vi
        .fn()
        .mockResolvedValueOnce({ items: [loaded], nextCursor: "cursor-2" })
        .mockResolvedValueOnce({ items: [older], nextCursor: null }),
      me: vi.fn(async () => testSession),
    });
    renderWithSession(<HomeView />, apiClient);
    const user = userEvent.setup();

    expect(
      await screen.findByText("loaded", { selector: "article p" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(
      await screen.findByText("older", { selector: "article p" }),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("textbox", { name: "What's happening?" }),
      { target: { value: "fresh" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    const banner = await screen.findByRole(
      "button",
      { name: "Show 1 new post" },
      { timeout: 3_000 },
    );
    expect(
      screen.queryByText("fresh", { selector: "article p" }),
    ).not.toBeInTheDocument();
    await user.click(banner);

    const items = within(
      screen.getByRole("list", { name: "Home" }),
    ).getAllByRole("article");
    expect(
      items.map(
        (item) => item.querySelector("p.whitespace-pre-wrap")?.textContent,
      ),
    ).toEqual(["fresh", "loaded", "older"]);
  });

  it("AC-B01.5 shows no posting block in the feed, then animates the new tweet in", async () => {
    let finish: () => void = () => undefined;
    const apiClient = fakeApiClient({
      createTweet: vi.fn(
        () =>
          new Promise<{ tweet: typeof testTweet }>((resolve) => {
            finish = () =>
              resolve({ tweet: { ...testTweet, content: "hello" } });
          }),
      ),
      me: vi.fn(async () => testSession),
    });
    renderWithSession(<HomeView />, apiClient);

    fireEvent.change(
      await screen.findByRole("textbox", { name: "What's happening?" }),
      { target: { value: "hello" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    // The composer reports the pending post; the timeline adds no block.
    expect(
      await screen.findByRole("button", { name: /Posting/ }),
    ).toBeDisabled();
    expect(screen.queryByText("Posting your tweet…")).not.toBeInTheDocument();
    expect(
      screen.queryByText("hello", { selector: "article p" }),
    ).not.toBeInTheDocument();

    await act(async () => finish());

    await waitFor(() => {
      const card = screen.getByText("hello", { selector: "article p" });
      expect(card.closest("li")).toHaveClass("tweet-appear");
    });
    expect(screen.queryByText("Posting your tweet…")).not.toBeInTheDocument();
  });
});

describe("TWT-03 undo a new post", () => {
  const fresh = { ...testTweet, content: "fresh post" };

  async function post(text = "fresh post") {
    fireEvent.change(
      await screen.findByRole("textbox", { name: "What's happening?" }),
      { target: { value: text } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    return screen.findByText(text, { selector: "article p" });
  }

  const card = (text: string) =>
    screen.getByText(text, { selector: "article p" }).closest("article");

  it("AC-B01.6 undoes a new post without the delete confirmation", async () => {
    const deleteTweet = vi.fn(async () => undefined);
    renderWithSession(
      <HomeView />,
      fakeApiClient({
        createTweet: vi.fn(async () => ({ tweet: fresh })),
        deleteTweet,
        me: vi.fn(async () => testSession),
      }),
    );
    await post();

    const article = card("fresh post") as HTMLElement;
    expect(within(article).getByText(/Undo available for/)).toBeVisible();
    await userEvent.click(
      within(article).getByRole("button", { name: "Undo" }),
    );

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText("fresh post", { selector: "article p" }),
      ).not.toBeInTheDocument(),
    );
    expect(deleteTweet).toHaveBeenCalledWith(fresh.id, testSession.csrfToken);
  });

  it("AC-B01.7 keeps the post and announces the error when Undo fails", async () => {
    renderWithSession(
      <HomeView />,
      fakeApiClient({
        createTweet: vi.fn(async () => ({ tweet: fresh })),
        deleteTweet: vi.fn(async () => {
          throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server.");
        }),
        me: vi.fn(async () => testSession),
      }),
    );
    await post();

    await userEvent.click(
      within(card("fresh post") as HTMLElement).getByRole("button", {
        name: "Undo",
      }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't undo this post.");
    expect(card("fresh post")).not.toBeNull();
  });

  it("AC-B01.6 removes Undo after 5 seconds, leaving the confirmed Delete", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderWithSession(
        <HomeView />,
        fakeApiClient({
          createTweet: vi.fn(async () => ({ tweet: fresh })),
          me: vi.fn(async () => testSession),
        }),
      );
      await post();
      const article = card("fresh post") as HTMLElement;
      expect(
        within(article).getByRole("button", { name: "Undo" }),
      ).toBeVisible();

      act(() => vi.advanceTimersByTime(5_000));

      await waitFor(() =>
        expect(
          within(article).queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument(),
      );
      expect(
        within(article).getByRole("button", { name: "Delete tweet" }),
      ).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-B01.6 gives each new post its own window", async () => {
    const createTweet = vi
      .fn()
      .mockResolvedValueOnce({ tweet: { ...fresh, content: "first" } })
      .mockResolvedValueOnce({
        tweet: {
          ...fresh,
          content: "second",
          id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f99",
        },
      });
    renderWithSession(
      <HomeView />,
      fakeApiClient({ createTweet, me: vi.fn(async () => testSession) }),
    );

    await post("first");
    await post("second");

    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(2);
  });

  it("AC-B01.7 ends the window when the member leaves the timeline", async () => {
    function Page() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(!open)} type="button">
            Toggle home
          </button>
          {open ? <HomeView /> : null}
        </>
      );
    }
    renderWithSession(
      <Page />,
      fakeApiClient({
        createTweet: vi.fn(async () => ({ tweet: fresh })),
        getTimeline: vi.fn(async () => ({ items: [], nextCursor: null })),
        me: vi.fn(async () => testSession),
      }),
    );
    await post();
    expect(screen.getByRole("button", { name: "Undo" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Toggle home" }));
    await userEvent.click(screen.getByRole("button", { name: "Toggle home" }));

    expect(
      await screen.findByText("fresh post", { selector: "article p" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
  });
});
