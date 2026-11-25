import { describe, expect, it } from "vitest";

import {
  createSignedKeysetCursor,
  InvalidKeysetCursorError,
} from "./signed-keyset-cursor.js";

const position = {
  createdAt: "2026-11-24T12:00:00.789123Z",
  id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f99",
};

describe("signed keyset cursor", () => {
  it("binds a position to its scope, key and label", () => {
    const cursor = createSignedKeysetCursor("secret", "feature-a/cursor-key");
    const token = cursor.encode("scope-a", position);

    expect(cursor.decode("scope-a", token)).toEqual(position);
    expect(() => cursor.decode("scope-b", token)).toThrow(
      InvalidKeysetCursorError,
    );
    expect(() =>
      createSignedKeysetCursor("secret", "feature-b/cursor-key").decode(
        "scope-a",
        token,
      ),
    ).toThrow(InvalidKeysetCursorError);
    expect(() =>
      createSignedKeysetCursor("other", "feature-a/cursor-key").decode(
        "scope-a",
        token,
      ),
    ).toThrow(InvalidKeysetCursorError);
  });
});
