import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { testTweet } from "./test-utils";
import { TweetCard } from "./tweet-card";

const AUTHOR_ID = testTweet.author.id;

describe("TweetCard content", () => {
  it("US-B01 AC-B01.1 shows the author, profile link, time, and multi-line text", () => {
    render(
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
    const { container } = render(
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
    render(
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
    render(
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
    render(
      <TweetCard onDelete={onDelete} tweet={testTweet} viewerId={AUTHOR_ID} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Delete tweet" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(testTweet.id);
  });

  it("US-B02 AC-B02.3 explains a failed delete and returns focus to Delete", async () => {
    render(
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
    render(
      <TweetCard onDelete={vi.fn()} tweet={testTweet} viewerId={AUTHOR_ID} />,
    );

    const trigger = screen.getByRole("button", { name: "Delete tweet" });
    expect(trigger.textContent).toBe("");
    expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
