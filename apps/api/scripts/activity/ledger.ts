import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * IDs of the tweets the simulator created, one per line. Reset deletes only
 * these, so posts a developer writes while logged in as a demo account stay.
 */
export function createLedger(file: URL) {
  const path = fileURLToPath(file);
  return {
    async record(tweetId: string): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, `${tweetId}\n`, { mode: 0o600 });
    },
    /** Well-formed IDs only; anything else in the file is ignored. */
    async read(): Promise<string[]> {
      try {
        const lines = (await readFile(path, "utf8")).split("\n");
        return [...new Set(lines.filter((line) => UUID.test(line)))];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw error;
      }
    },
    async clear(): Promise<void> {
      await rm(path, { force: true });
    },
  };
}
