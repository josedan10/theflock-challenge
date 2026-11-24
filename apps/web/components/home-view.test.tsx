import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    await screen.findByText(content, { selector: "article p" });
  };

  it("TWT-02 offers the composer and invites a first post", async () => {
    renderWithSession(<HomeView />, signedIn());

    expect(
      await screen.findByRole("textbox", { name: "What's happening?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your new posts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing posted yet. Share your first tweet above."),
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
      screen.getByRole("list", { name: "Your new posts" }),
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
});
