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

it("DEV-01 remembers simulated tweet IDs until reset clears them", async () => {
  dir = await mkdtemp(join(tmpdir(), "activity-ledger-"));
  const file = pathToFileURL(join(dir, "nested", "posts.txt"));
  const ledger = createLedger(file);

  expect(await ledger.read()).toEqual([]);
  await ledger.record(id);
  await ledger.record(id);
  expect(await ledger.read()).toEqual([id]);

  await writeFile(file, `${id}\nnot-an-id\n'; drop table tweets;--\n`);
  expect(await ledger.read()).toEqual([id]);

  await ledger.clear();
  expect(await ledger.read()).toEqual([]);
});
