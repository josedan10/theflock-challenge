import type { TimelineEntry, TimelinePosition } from "./read-timeline.js";

export type ReadTimelineSinceRows = (
  viewer: string,
  after: TimelinePosition,
  count: number,
) => Promise<TimelineEntry[]>;

export interface TimelineSincePage {
  items: TimelineEntry[];
  truncated: boolean;
}

/**
 * Eligible tweets strictly newer than `after`, newest first, capped so a
 * reconnect cannot dump an unbounded backlog (AC-F01.3).
 */
export function createReadTimelineSince(readRows: ReadTimelineSinceRows) {
  return async (
    viewer: string,
    after: TimelinePosition,
    limit: number,
  ): Promise<TimelineSincePage> => {
    const rows = await readRows(viewer, after, limit + 1);
    return {
      items: rows.slice(0, limit),
      truncated: rows.length > limit,
    };
  };
}
