import {
  createSignedKeysetCursor,
  InvalidKeysetCursorError,
} from "../../../platform/pagination/signed-keyset-cursor.js";
import {
  InvalidTimelineCursorError,
  type TimelineCursor,
} from "../application/read-timeline.js";

/**
 * SSE `id` / `Last-Event-ID` values. Signed like home-timeline cursors but
 * under a live-only key, so a pagination cursor cannot be replayed as catch-up
 * and a live id cannot fetch an older page.
 *
 * @throws {InvalidTimelineCursorError} When the token is not a valid live
 * event id for this viewer and key.
 */
export function createLiveEventCursor(sessionSecret: string): TimelineCursor {
  const cursor = createSignedKeysetCursor(
    sessionSecret,
    "home-timeline/live-event",
  );
  return {
    encode: (viewer, position) => cursor.encode(viewer, position),
    decode(viewer, token) {
      try {
        return cursor.decode(viewer, token);
      } catch (error: unknown) {
        if (error instanceof InvalidKeysetCursorError) {
          throw new InvalidTimelineCursorError();
        }
        throw error;
      }
    },
  };
}
