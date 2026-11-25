/** A committed tweet that may belong on some members' live home streams. */
export interface LiveTimelineTweet {
  tweetId: string;
  authorId: string;
  createdAt: string;
}

/** One SSE subscriber. `close` ends that connection so a cap can evict it. */
export interface TimelineLiveConnection {
  push: (event: LiveTimelineTweet) => void;
  close: () => void;
}

/**
 * In-process fan-out for LIVE-01. Missed events are recovered from the tweets
 * table on reconnect, so this hub is not a durable log.
 */
export interface TimelineLiveHub {
  subscribe(viewerId: string, connection: TimelineLiveConnection): () => void;
  deliver(event: LiveTimelineTweet, recipientIds: ReadonlySet<string>): void;
  connectionCount(viewerId: string): number;
  close(): void;
}

/** Soft cap so one member cannot hold unbounded SSE sockets. */
export const MAX_TIMELINE_LIVE_CONNECTIONS_PER_VIEWER = 8;

/** SSE comment interval so idle proxies do not drop the connection. */
export const DEFAULT_TIMELINE_LIVE_HEARTBEAT_MS = 25_000;

/** Holds live home-timeline subscribers for this API process. */
export function createTimelineLiveHub(
  maxPerViewer = MAX_TIMELINE_LIVE_CONNECTIONS_PER_VIEWER,
): TimelineLiveHub {
  const byViewer = new Map<string, TimelineLiveConnection[]>();

  function remove(viewerId: string, connection: TimelineLiveConnection): void {
    const current = byViewer.get(viewerId);
    if (current === undefined) {
      return;
    }
    const next = current.filter((item) => item !== connection);
    if (next.length === 0) {
      byViewer.delete(viewerId);
      return;
    }
    byViewer.set(viewerId, next);
  }

  return {
    subscribe(viewerId, connection) {
      const current = byViewer.get(viewerId) ?? [];
      if (current.length >= maxPerViewer) {
        const oldest = current.shift();
        oldest?.close();
      }
      current.push(connection);
      byViewer.set(viewerId, current);
      return () => remove(viewerId, connection);
    },
    deliver(event, recipientIds) {
      for (const [viewerId, connections] of byViewer) {
        if (!recipientIds.has(viewerId)) {
          continue;
        }
        for (const connection of connections) {
          connection.push(event);
        }
      }
    },
    connectionCount(viewerId) {
      return byViewer.get(viewerId)?.length ?? 0;
    },
    close() {
      for (const connections of byViewer.values()) {
        for (const connection of [...connections]) {
          connection.close();
        }
      }
      byViewer.clear();
    },
  };
}
