import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useSession } from "../lib/session";

import {
  fakeApiClient,
  renderWithSession,
  testSession,
  testTweet,
} from "./test-utils";
import { TweetCard } from "./tweet-card";

const AUTHOR_ID = testTweet.author.id;

describe("TweetCard content", () => {
  it("US-B01 AC-B01.1 shows the author, profile link, time, and multi-line text", () => {
    renderWithSession(
      <TweetCard
        tweet={{ ...testTweet, content: "hi\nthere" }}
        viewerId={null}
      />,
    );

    const card = screen.getByRole("article");
    expect(card).toHaveTextContent(testTweet.author.displayName);
    expect(
      screen.getByRole("link", { name: `@${testTweet.author.username}` }),
    ).toHaveAttribute("href", `/u/${testTweet.author.username}`);
    expect(card.querySelector("time")).toHaveAttribute(
      "datetime",
      testTweet.createdAt,
    );
    expect(screen.getByText(/hi\s+there/)).toHaveClass("whitespace-pre-wrap");
  });

  it("renders hostile markup as plain text", () => {
    const { container } = renderWithSession(
      <TweetCard
        tweet={{ ...testTweet, content: "<img src=x onerror=alert(1)>" }}
        viewerId={null}
      />,
    );

    expect(
      screen.getByText("<img src=x onerror=alert(1)>"),
    ).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
  });
});

describe("TweetCard delete", () => {
  it("US-B02 AC-B02.2 offers Delete only to the author", () => {
    renderWithSession(
      <TweetCard
        onDelete={vi.fn()}
        tweet={testTweet}
        viewerId="someone-else"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Delete tweet" }),
    ).not.toBeInTheDocument();
  });

  it("US-B02 AC-B02.3 asks for confirmation and does nothing on Cancel", async () => {
    const onDelete = vi.fn();
    renderWithSession(
      <TweetCard onDelete={onDelete} tweet={testTweet} viewerId={AUTHOR_ID} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Delete tweet" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete this tweet?",
    });
    expect(dialog).toHaveTextContent("This can't be undone.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("US-B02 AC-B02.1 deletes after confirmation", async () => {
    const onDelete = vi.fn();
    renderWithSession(
      <TweetCard onDelete={onDelete} tweet={testTweet} viewerId={AUTHOR_ID} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Delete tweet" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(testTweet.id);
  });

  it("US-B02 AC-B02.3 explains a failed delete and returns focus to Delete", async () => {
    renderWithSession(
      <TweetCard
        failure="We couldn't delete this tweet. Check your connection and try again."
        onDelete={vi.fn()}
        tweet={testTweet}
        viewerId={AUTHOR_ID}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't delete this tweet.",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Delete tweet" }),
      ).toHaveFocus(),
    );
  });

  it("US-B02 shows Delete as a named trash-can icon button", () => {
    renderWithSession(
      <TweetCard onDelete={vi.fn()} tweet={testTweet} viewerId={AUTHOR_ID} />,
    );

    const trigger = screen.getByRole("button", { name: "Delete tweet" });
    expect(trigger.textContent).toBe("");
    expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("TweetCard actions", () => {
  const busy = { ...testTweet, likeCount: 1_200, replyCount: 3 };

  it("US-B04 opens the thread from a chat bubble named with its reply count", () => {
    renderWithSession(<TweetCard tweet={busy} viewerId={null} />);

    const bubble = screen.getByRole("link", { name: "Open thread, 3 replies" });
    expect(bubble).toHaveAttribute("href", `/tweets/${testTweet.id}`);
    expect(bubble).toHaveTextContent("3");
  });

  it("US-C02 invites a signed-out reader to log in to like", () => {
    renderWithSession(<TweetCard tweet={busy} viewerId={null} />);

    const like = screen.getByRole("link", {
      name: "Log in to like, 1.2k likes",
    });
    expect(like).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: /^Like/ })).toBeNull();
  });

  it("US-C02 AC-C02.2 toggles a like for a member and shows the new state", async () => {
    const like = vi.fn(async () => ({ like: { likeCount: 1, liked: true } }));
    function SignedInCard() {
      // The app header loads the session; this test loads it the same way.
      const session = useSession();
      return session.data ? (
        <TweetCard tweet={testTweet} viewerId={session.data.user.id} />
      ) : null;
    }
    renderWithSession(
      <SignedInCard />,
      fakeApiClient({ like, me: vi.fn(async () => testSession) }),
    );

    const heart = await screen.findByRole("button", { name: "Like, 0 likes" });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(heart);

    await waitFor(() =>
      expect(like).toHaveBeenCalledWith(testTweet.id, testSession.csrfToken),
    );
  });

  it("US-B04 hides zero counts but keeps them in the accessible name", () => {
    renderWithSession(<TweetCard tweet={testTweet} viewerId={null} />);

    const bubble = screen.getByRole("link", { name: "Open thread, 0 replies" });
    expect(bubble.textContent).toBe("");
  });

  it("US-B04 on a thread's focused tweet, the bubble focuses the reply box or asks a guest to log in", async () => {
    const onReply = vi.fn();
    const { unmount } = renderWithSession(
      <TweetCard
        onReply={onReply}
        tweet={busy}
        variant="focus"
        viewerId={null}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reply, 3 replies" }),
    );
    expect(onReply).toHaveBeenCalledOnce();
    unmount();

    renderWithSession(
      <TweetCard tweet={busy} variant="focus" viewerId={null} />,
    );
    expect(
      screen.getByRole("link", { name: "Log in to reply, 3 replies" }),
    ).toHaveAttribute("href", "/login");
  });

  it("US-B04 names the parent when replying out of sequence", () => {
    renderWithSession(
      <TweetCard
        replyingTo="grace"
        tweet={testTweet}
        variant="row"
        viewerId={null}
      />,
    );

    expect(screen.getByText(/Replying to/)).toHaveTextContent(
      "Replying to @grace",
    );
    expect(screen.getByRole("link", { name: "@grace" })).toHaveAttribute(
      "href",
      "/u/grace",
    );
  });
});
