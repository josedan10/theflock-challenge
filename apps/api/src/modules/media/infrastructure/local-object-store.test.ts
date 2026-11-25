import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLocalObjectStore } from "./local-object-store.js";

const KEY = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61";

describe("local object store", () => {
  it("US-F02 stores, reads, and deletes one generated key", async () => {
    const root = await mkdtemp(join(tmpdir(), "media-"));
    const store = createLocalObjectStore(root);
    const bytes = Buffer.from("png");

    await store.put(KEY, bytes);
    await expect(store.get(KEY)).resolves.toEqual(bytes);
    await store.delete(KEY);
    await expect(store.get(KEY)).resolves.toBeNull();
    await expect(store.delete(KEY)).resolves.toBeUndefined();
  });

  it.each(["../etc/passwd", "nested/key", KEY + ".partial", "not-a-uuid"])(
    "ASVS V5.3.2 rejects %s",
    async (key) => {
      const store = createLocalObjectStore("/tmp/unused-media-root");
      await expect(store.get(key)).rejects.toThrow(/server-generated/);
      await expect(store.put(key, Buffer.from("x"))).rejects.toThrow(
        /server-generated/,
      );
    },
  );
});
