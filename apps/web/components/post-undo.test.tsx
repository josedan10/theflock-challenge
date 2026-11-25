import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostUndo } from "./post-undo";

const NOW = new Date("2026-11-25T12:00:00.000Z").getTime();

describe("PostUndo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "setTimeout"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("TWT-03 AC-B01.6 counts down in text and expires exactly at the deadline", () => {
    const onExpire = vi.fn();
    render(
      <PostUndo expiresAt={NOW + 5_000} onExpire={onExpire} onUndo={vi.fn()} />,
    );

    expect(screen.getByText(/Undo available for/)).toHaveTextContent("5s");
    act(() => vi.advanceTimersByTime(1_250));
    expect(screen.getByText(/Undo available for/)).toHaveTextContent("4s");
    act(() => vi.advanceTimersByTime(3_749));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("TWT-03 AC-B01.7 is not a live region; Undo is described by the time left", () => {
    render(
      <PostUndo expiresAt={NOW + 3_000} onExpire={vi.fn()} onUndo={vi.fn()} />,
    );

    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveAccessibleDescription(/3 seconds left/);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("TWT-03 AC-B01.6 runs Undo once and blocks repeats while pending", async () => {
    vi.useRealTimers();
    const onUndo = vi.fn();
    const { rerender } = render(
      <PostUndo
        expiresAt={Date.now() + 5_000}
        onExpire={vi.fn()}
        onUndo={onUndo}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();

    rerender(
      <PostUndo
        expiresAt={Date.now() + 5_000}
        onExpire={vi.fn()}
        onUndo={onUndo}
        pending
      />,
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("TWT-03 expires at once when the window has already passed", () => {
    const onExpire = vi.fn();
    render(
      <PostUndo expiresAt={NOW - 1} onExpire={onExpire} onUndo={vi.fn()} />,
    );

    expect(onExpire).toHaveBeenCalledOnce();
  });
});
