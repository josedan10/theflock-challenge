import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, expect, it } from "vitest";

import { createLedger } from "./ledger.js";

const id = "01a2140b-d43f-7461-bf5d-ca730ac941a5";
let dir: string | undefined;

afterEach(async () => {
  if (dir !== undefined) {
    await rm(dir, { force: true, recursive: true });
  }
});

const userId = "416b0bb3-5154-4ac6-9e33-3a58e76ce518";
const empty = { likes: [], tweetIds: [] };

it("DEV-01 remembers simulated tweets and likes until reset clears them", async () => {
  dir = await mkdtemp(join(tmpdir(), "activity-ledger-"));
  const file = pathToFileURL(join(dir, "nested", "posts.txt"));
  const ledger = createLedger(file);

  expect(await ledger.read()).toEqual(empty);
  await ledger.record({ id, kind: "tweet" });
  await ledger.record({ id, kind: "tweet" });
  await ledger.record({ kind: "like", tweetId: id, userId });
  await ledger.record({ kind: "like", tweetId: id, userId });
  expect(await ledger.read()).toEqual({
    likes: [{ tweetId: id, userId }],
    tweetIds: [id],
  });

  // Bare IDs from the first ledger format still count as tweets.
  await writeFile(
    file,
    `${id}\nnot-an-id\nlike ${userId}\n'; drop table tweets;--\n`,
  );
  expect(await ledger.read()).toEqual({ likes: [], tweetIds: [id] });

  await ledger.clear();
  expect(await ledger.read()).toEqual(empty);
});
