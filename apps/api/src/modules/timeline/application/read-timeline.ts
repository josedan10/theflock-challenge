import type { TweetImage } from "@twitter-clone/contracts";

/** UTC timestamp at PostgreSQL microsecond precision, plus the UUID tie-breaker. */
export interface TimelinePosition {
  createdAt: string;
  id: string;
}

export interface TimelineEntry extends TimelinePosition {
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: null;
  };
  content: string;
  likeCount: number;
  likedByViewer: boolean;
  /** Direct replies, counted for this bounded page only. */
  replyCount: number;
  /**
   * Parent of a reply. Null for a root tweet. `username` is null when that
   * member is no longer visible; the parent text stays, because the tweet is public.
   */
  replyingTo: {
    content: string;
    id: string;
    username: string | null;
  } | null;
  image: TweetImage | null;
}

export class InvalidTimelineCursorError extends Error {}

export interface TimelineCursor {
  encode(viewer: string, position: TimelinePosition): string;
  /** Rejects malformed, modified and other viewers' cursors before a timeline read. */
  decode(viewer: string, token: string): TimelinePosition;
}

export type ReadTimelineRows = (
  viewer: string,
  before: TimelinePosition | null,
  count: number,
) => Promise<TimelineEntry[]>;

/** Bounded keyset read; the cursor anchors on the last returned row, not the lookahead. */
export function createReadTimeline(
  readRows: ReadTimelineRows,
  cursors: TimelineCursor,
) {
  return async (viewer: string, limit: number, cursor?: string) => {
    const before = cursor === undefined ? null : cursors.decode(viewer, cursor);
    const rows = await readRows(viewer, before, limit + 1);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > limit && last !== undefined
          ? cursors.encode(viewer, last)
          : null,
    };
  };
}
