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

/** Domain-separated MAC covers the version, viewer and exact encoded boundary. */
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
