import { TIMELINE_LIVE_CATCHUP_LIMIT } from "@twitter-clone/contracts";

import { formatUtcMicroseconds } from "../../platform/time/utc-microseconds.js";

import { createReadTimelineSince } from "./application/read-timeline-since.js";
import {
  createTimelineLiveHub,
  DEFAULT_TIMELINE_LIVE_HEARTBEAT_MS,
  MAX_TIMELINE_LIVE_CONNECTIONS_PER_VIEWER,
} from "./application/timeline-live-hub.js";
import {
  createListTimelineRecipients,
  createReadTimelineSinceRows,
} from "./infrastructure/drizzle-timeline.js";
import { createLiveEventCursor } from "./infrastructure/signed-live-event-cursor.js";

import type { Database } from "../../platform/database/client.js";
import type { TimelineCursor } from "./application/read-timeline.js";
import type { TimelineLiveHub } from "./application/timeline-live-hub.js";

export interface TimelineLiveRuntime {
  hub: TimelineLiveHub;
  events: TimelineCursor;
  readSince: ReturnType<typeof createReadTimelineSince>;
  heartbeatMs: number;
  catchUpLimit: number;
  publish(tweet: {
    id: string;
    authorId: string;
    createdAt: Date;
  }): Promise<void>;
  close(): void;
}

export interface TimelineLiveRuntimeOptions {
  db: Database;
  sessionSecret: string;
  heartbeatMs?: number;
  maxConnectionsPerViewer?: number;
  catchUpLimit?: number;
}

/**
 * Shared live-timeline process state: in-memory subscribers plus the catch-up
 * query. Created once per API instance so tweet writes and the SSE route see
 * the same hub.
 */
export function createTimelineLiveRuntime(
  options: TimelineLiveRuntimeOptions,
): TimelineLiveRuntime {
  const hub = createTimelineLiveHub(
    options.maxConnectionsPerViewer ?? MAX_TIMELINE_LIVE_CONNECTIONS_PER_VIEWER,
  );
  const listRecipients = createListTimelineRecipients(options.db);
  const readSince = createReadTimelineSince(
    createReadTimelineSinceRows(options.db),
  );
  const events = createLiveEventCursor(options.sessionSecret);
  return {
    catchUpLimit: options.catchUpLimit ?? TIMELINE_LIVE_CATCHUP_LIMIT,
    close() {
      hub.close();
    },
    events,
    heartbeatMs: options.heartbeatMs ?? DEFAULT_TIMELINE_LIVE_HEARTBEAT_MS,
    hub,
    async publish(tweet) {
      try {
        hub.deliver(
          {
            authorId: tweet.authorId,
            createdAt: formatUtcMicroseconds(tweet.createdAt),
            tweetId: tweet.id,
          },
          new Set(await listRecipients(tweet.authorId)),
        );
      } catch {
        // The write already committed. Reconnect catch-up recovers a missed
        // fan-out; failing 201 because SSE failed would hide a successful post.
      }
    },
    readSince,
  };
}
