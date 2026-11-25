import { TIMELINE_LIVE_EVENT } from "@twitter-clone/contracts";

import type { LiveTimelineTweet } from "../application/timeline-live-hub.js";
import type { Writable } from "node:stream";

function canWrite(stream: Writable): boolean {
  return !stream.destroyed && stream.writable;
}

/** One SSE event. `id` is the signed live cursor for reconnect catch-up. */
export function writeTimelineLiveEvent(
  stream: Writable,
  id: string,
  event: LiveTimelineTweet,
): void {
  if (!canWrite(stream)) {
    return;
  }
  stream.write(`id: ${id}\n`);
  stream.write(`event: ${TIMELINE_LIVE_EVENT}\n`);
  stream.write(`data: ${JSON.stringify({ tweetId: event.tweetId })}\n\n`);
}

/** SSE comment so idle proxies do not drop the connection. */
export function writeSseComment(stream: Writable): void {
  if (!canWrite(stream)) {
    return;
  }
  stream.write(":\n\n");
}
