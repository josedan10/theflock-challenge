import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  clearUndoWindows,
  closeUndoWindow,
  openUndoWindow,
  UNDO_WINDOW_MS,
} from "./post-undo";

const windows = (client: QueryClient) =>
  client.getQueryData(["post-undo", "ada"]);

describe("post undo windows", () => {
  it("TWT-03 AC-B01.6 gives each new post its own 5-second window", () => {
    const client = new QueryClient();

    openUndoWindow(client, "ada", "t1", 1_000);
    openUndoWindow(client, "ada", "t2", 3_000);

    expect(windows(client)).toEqual({
      t1: 1_000 + UNDO_WINDOW_MS,
      t2: 3_000 + UNDO_WINDOW_MS,
    });
    expect(client.getQueryData(["post-undo", "grace"])).toBeUndefined();
  });

  it("TWT-03 AC-B01.6 closes one window and leaves the others", () => {
    const client = new QueryClient();
    openUndoWindow(client, "ada", "t1", 0);
    openUndoWindow(client, "ada", "t2", 0);

    closeUndoWindow(client, "ada", "t1");
    closeUndoWindow(client, "ada", "missing");

    expect(windows(client)).toEqual({ t2: UNDO_WINDOW_MS });
  });

  it("TWT-03 AC-B01.7 ends every window when the timeline is left", () => {
    const client = new QueryClient();
    openUndoWindow(client, "ada", "t1", 0);

    clearUndoWindows(client, "ada");

    expect(windows(client)).toEqual({});
  });
});
