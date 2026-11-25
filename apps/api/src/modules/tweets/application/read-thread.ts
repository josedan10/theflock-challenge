import { TweetNotFoundError } from "../domain/errors.js";

import type { ThreadItem, ThreadPage } from "@twitter-clone/contracts";

interface Position {
  id: string;
  createdAt: string;
}
interface Cursor {
  encode(scope: string, position: Position): string;
  decode(scope: string, token: string): Position;
}

/** Cursors are scoped to the selected tweet, not an untrusted claimed root or an offset. */
export function createReadThread(
  read: (
    root: string,
    viewer: string | null,
    after: Position | null,
    count: number,
  ) => Promise<ThreadItem[]>,
  cursor: Cursor,
) {
  return async (
    id: string,
    viewer: string | null,
    limit: number,
    token?: string,
  ): Promise<ThreadPage> => {
    const after = token === undefined ? null : cursor.decode(id, token);
    const [selected, ...descendants] = await read(id, viewer, after, limit + 1);
    if (!selected) {
      throw new TweetNotFoundError();
    }
    const items = descendants.slice(0, limit);
    const last = items.at(-1);
    return {
      selected,
      items,
      nextCursor:
        descendants.length > limit && last ? cursor.encode(id, last) : null,
    };
  };
}
