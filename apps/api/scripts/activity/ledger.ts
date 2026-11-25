import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { SimulatedLike } from "./store.js";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TWEET_LINE = new RegExp(`^(?:tweet )?(${UUID})$`);
const LIKE_LINE = new RegExp(`^like (${UUID}) (${UUID})$`);

/** Something the simulator did that reset should undo. */
export type LedgerEntry =
  { kind: "tweet"; id: string } | ({ kind: "like" } & SimulatedLike);

/**
 * What the simulator created, one entry per line: `tweet <id>` or
 * `like <user id> <tweet id>`. Reset undoes only these, so anything a
 * developer does while logged in as a demo account stays.
 */
export function createLedger(file: URL) {
  const path = fileURLToPath(file);
  return {
    async record(entry: LedgerEntry): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      const line =
        entry.kind === "tweet"
          ? `tweet ${entry.id}`
          : `like ${entry.userId} ${entry.tweetId}`;
      await appendFile(path, `${line}\n`, { mode: 0o600 });
    },
    /** Well-formed entries only; anything else in the file is ignored. */
    async read(): Promise<{ tweetIds: string[]; likes: SimulatedLike[] }> {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { likes: [], tweetIds: [] };
        }
        throw error;
      }
      const tweetIds = new Set<string>();
      const likes = new Map<string, SimulatedLike>();
      for (const line of text.split("\n")) {
        const tweet = TWEET_LINE.exec(line);
        if (tweet?.[1] !== undefined) {
          tweetIds.add(tweet[1]);
          continue;
        }
        const like = LIKE_LINE.exec(line);
        if (like?.[1] !== undefined && like[2] !== undefined) {
          likes.set(`${like[1]} ${like[2]}`, {
            tweetId: like[2],
            userId: like[1],
          });
        }
      }
      return { likes: [...likes.values()], tweetIds: [...tweetIds] };
    },
    async clear(): Promise<void> {
      await rm(path, { force: true });
    },
  };
}
