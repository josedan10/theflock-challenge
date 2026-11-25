import {
  createSignedKeysetCursor,
  InvalidKeysetCursorError,
} from "../../../platform/pagination/signed-keyset-cursor.js";
import {
  InvalidTimelineCursorError,
  type TimelineCursor,
} from "../application/read-timeline.js";

/**
 * Home-timeline cursors: a signed keyset position scoped to the viewer, under
 * a timeline-only key label (see `createSignedKeysetCursor`). A cursor minted
 * for one member fails for every other member.
 *
 * @throws {InvalidTimelineCursorError} When the token is not a valid cursor
 * for this viewer and key.
 */
export function createTimelineCursor(sessionSecret: string): TimelineCursor {
  const cursor = createSignedKeysetCursor(
    sessionSecret,
    "home-timeline/cursor-key",
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
