import { createHmac, timingSafeEqual } from "node:crypto";

import { TIMELINE_CURSOR_MAX_LENGTH } from "@twitter-clone/contracts";
import { z } from "zod";

/** UTC timestamp at PostgreSQL microsecond precision, plus the UUID tie-breaker. */
export interface KeysetPosition {
  createdAt: string;
  id: string;
}

export class InvalidKeysetCursorError extends Error {}

export interface SignedKeysetCursor {
  encode(scope: string, position: KeysetPosition): string;
  /** Rejects malformed, modified and other scopes' cursors before any read. */
  decode(scope: string, token: string): KeysetPosition;
}

const version = "v1";
const envelope = z.tuple([
  z.literal(version),
  z.string().regex(/^[A-Za-z0-9_-]+$/),
  z.string().regex(/^[A-Za-z0-9_-]{43}$/),
]);

const position = z.tuple([z.iso.datetime({ precision: 6 }), z.uuid()]);

/**
 * Signs a keyset boundary so the client can ask for the next page without
 * choosing where that page starts.
 *
 * A token is `v1.<payload>.<mac>`. The payload is the UTC timestamp, kept at
 * six fractional digits, and the row id. The scope (for example the viewer,
 * or the list being read) is not stored in it. The MAC is HMAC-SHA256 over
 * the version, the scope, and that payload. Its key is itself an HMAC of the
 * session secret under a feature-only `label`, so a CSRF token or a cursor
 * from another feature cannot be reused. A cursor minted for one scope fails
 * for every other scope. Rotating the session secret invalidates outstanding
 * cursors.
 *
 * Decode rejects the token before any read. Length and shape are checked
 * first. The signature comparison is timing-safe and only runs once both
 * sides are the 43-character SHA-256 encoding, so the lengths match. A valid
 * signature is still not trusted: the timestamp must be a real six-digit UTC
 * instant and the id must be a UUID. Every failure is the same error, and the
 * anchor row is never looked up.
 *
 * @throws {InvalidKeysetCursorError} When the token has the wrong length,
 * shape, scope, key, or boundary.
 */
export function createSignedKeysetCursor(
  sessionSecret: string,
  label: string,
): SignedKeysetCursor {
  const key = createHmac("sha256", sessionSecret).update(label).digest();
  const mac = (scope: string, payload: string) =>
    createHmac("sha256", key)
      .update(`${version}:${scope}:${payload}`)
      .digest("base64url");
  return {
    encode(scope, { createdAt, id }) {
      const payload = Buffer.from(`${createdAt}|${id}`).toString("base64url");
      return `${version}.${payload}.${mac(scope, payload)}`;
    },
    decode(scope, token) {
      if (token.length > TIMELINE_CURSOR_MAX_LENGTH) {
        throw new InvalidKeysetCursorError();
      }
      const parsed = envelope.safeParse(token.split("."));
      if (!parsed.success) {
        throw new InvalidKeysetCursorError();
      }
      const [, payload, signature] = parsed.data;
      if (
        !timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(mac(scope, payload)),
        )
      ) {
        throw new InvalidKeysetCursorError();
      }
      const result = position.safeParse(
        Buffer.from(payload, "base64url").toString("utf8").split("|"),
      );
      if (!result.success) {
        throw new InvalidKeysetCursorError();
      }
      const [createdAt, id] = result.data;
      return { createdAt, id };
    },
  };
}
