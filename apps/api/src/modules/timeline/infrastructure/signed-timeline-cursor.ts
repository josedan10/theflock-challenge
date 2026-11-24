import { createHmac, timingSafeEqual } from "node:crypto";

import { TIMELINE_CURSOR_MAX_LENGTH } from "@twitter-clone/contracts";
import { z } from "zod";

import {
  InvalidTimelineCursorError,
  type TimelineCursor,
} from "../application/read-timeline.js";

const version = "v1";
const envelope = z.tuple([
  z.literal(version),
  z.string().regex(/^[A-Za-z0-9_-]+$/),
  z.string().regex(/^[A-Za-z0-9_-]{43}$/),
]);

const position = z.tuple([z.iso.datetime({ precision: 6 }), z.uuid()]);

/**
 * Signs the keyset boundary so the client can ask for the next page without
 * choosing where that page starts.
 *
 * A token is `v1.<payload>.<mac>`. The payload is the UTC timestamp, kept at
 * six fractional digits, and the tweet id. The viewer id is not stored in
 * it. The MAC is HMAC-SHA256 over the version, the viewer, and that payload.
 * Its key is itself an HMAC of the session secret under a timeline-only
 * label, so a CSRF token or a cursor from another feature cannot be reused
 * here. A cursor minted for one member fails for every other member.
 * Rotating the session secret invalidates outstanding cursors.
 *
 * Decode rejects the token before any timeline read. Length and shape are
 * checked first. The signature comparison is timing-safe and only runs once
 * both sides are the 43-character SHA-256 encoding, so the lengths match.
 * A valid signature is still not trusted: the timestamp must be a real
 * six-digit UTC instant and the id must be a UUID. Every failure is the
 * same invalid-cursor error, and the anchor tweet is never looked up.
 *
 * @throws {InvalidTimelineCursorError} When the token has the wrong length,
 * shape, viewer, key, or boundary.
 */
export function createTimelineCursor(sessionSecret: string): TimelineCursor {
  const key = createHmac("sha256", sessionSecret)
    .update("home-timeline/cursor-key")
    .digest();
  const mac = (viewer: string, payload: string) =>
    createHmac("sha256", key)
      .update(`${version}:${viewer}:${payload}`)
      .digest("base64url");
  return {
    encode(viewer, { createdAt, id }) {
      const payload = Buffer.from(`${createdAt}|${id}`).toString("base64url");
      return `${version}.${payload}.${mac(viewer, payload)}`;
    },
    decode(viewer, token) {
      if (token.length > TIMELINE_CURSOR_MAX_LENGTH) {
        throw new InvalidTimelineCursorError();
      }
      const parsed = envelope.safeParse(token.split("."));
      if (!parsed.success) {
        throw new InvalidTimelineCursorError();
      }
      const [, payload, signature] = parsed.data;
      if (
        !timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(mac(viewer, payload)),
        )
      ) {
        throw new InvalidTimelineCursorError();
      }
      const result = position.safeParse(
        Buffer.from(payload, "base64url").toString("utf8").split("|"),
      );
      if (!result.success) {
        throw new InvalidTimelineCursorError();
      }
      const [createdAt, id] = result.data;
      return { createdAt, id };
    },
  };
}
