import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";
import { threadHref } from "../lib/navigation";

import {
  fakeApiClient,
  renderWithSession,
  testSession,
  testTweet,
} from "./test-utils";
import { ThreadView } from "./thread-view";

const selected = { ...testTweet, parentTweetId: null };
const child = {
  ...testTweet,
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f62",
  content: "Child",
  parentTweetId: selected.id,
};

describe("THR-01 AC-B04.5", () => {
  it("offers public reading and preserves replies on a failed page with keyboard retry", async () => {
    const getThread = vi
      .fn()
      .mockResolvedValueOnce({ selected, items: [child], nextCursor: "next" })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        selected,
        items: [
          {
            ...child,
            id: "nested",
            content: "Grandchild",
            parentTweetId: child.id,
          },
        ],
        nextCursor: null,
      });
    renderWithSession(
      <ThreadView id={selected.id} />,
      fakeApiClient({ getThread }),
    );
    expect(screen.getByText("Loading thread…")).toBeInTheDocument();
    expect(await screen.findByText("Child")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Log in to reply" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open thread/ })).toHaveAttribute(
      "href",
      threadHref(child.id),
    );
    const button = screen.getByRole("button", { name: "Load more replies" });
    button.focus();
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    await screen.findByText("Couldn't load this thread.");
    expect(screen.getByText("Child")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Grandchild")).toBeInTheDocument();
    expect(screen.getByText("End of thread.")).toBeInTheDocument();
    expect(getThread).toHaveBeenLastCalledWith(selected.id, "next");
  });
  it("replies to the selected node, keeps draft after failure, reconciles after success", async () => {
    const createReply = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", "rate limited"))
      .mockResolvedValueOnce({ tweet: child });
    const getThread = vi
      .fn()
      .mockResolvedValueOnce({ selected, items: [], nextCursor: null })
      .mockResolvedValue({ selected, items: [child], nextCursor: null });
    renderWithSession(
      <ThreadView id={selected.id} />,
      fakeApiClient({ getThread, createReply, me: async () => testSession }),
    );
    const user = userEvent.setup();
    await screen.findByText("No replies yet.");
    const textarea = screen.getByRole("textbox", { name: "Your reply" });
    await user.type(textarea, "Child");
    await user.click(screen.getByRole("button", { name: "Post reply" }));
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
    expect(textarea).toHaveValue("Child");
    await user.click(screen.getByRole("button", { name: "Post reply" }));
    await waitFor(() => expect(textarea).toHaveValue(""));
    expect(createReply).toHaveBeenCalledWith(
      selected.id,
      { content: "Child" },
      testSession.csrfToken,
    );
    expect(await screen.findByText("Reply posted.")).toBeInTheDocument();
    expect(await screen.findByText("Child")).toBeInTheDocument();
  });
  it("hides removed selected content after a successful delete and keeps it on failure", async () => {
    const getThread = vi
      .fn()
      .mockResolvedValueOnce({ selected, items: [], nextCursor: null })
      .mockRejectedValue(new ApiError(404, "NOT_FOUND", "gone"));
    const deleteTweet = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    renderWithSession(
      <ThreadView id={selected.id} />,
      fakeApiClient({ getThread, deleteTweet, me: async () => testSession }),
    );
    const user = userEvent.setup();
    const confirm = async () => {
      await user.click(
        await screen.findByRole("button", { name: "Delete tweet" }),
      );
      await user.click(screen.getByRole("button", { name: "Delete" }));
    };
    await confirm();
    expect(
      await screen.findByText(/Couldn't delete this tweet/),
    ).toBeInTheDocument();
    await confirm();
    expect(
      await screen.findByText("This tweet no longer exists."),
    ).toBeInTheDocument();
    expect(screen.queryByText(selected.content)).not.toBeInTheDocument();
  });
});
