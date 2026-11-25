import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ObjectStore } from "../application/ports.js";

/** Server-generated object ids. Anything else is a path-traversal attempt. */
const OBJECT_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function objectPath(root: string, key: string): string {
  if (!OBJECT_KEY.test(key)) {
    throw new Error("Object key is not a server-generated id.");
  }
  return join(root, key);
}

/**
 * Local object storage on a configured directory (IMG-01). Callers mount that
 * directory as a volume; it is not the container's writable layer and it is
 * not a backup. ASVS 5.0.0 V5.3.2: paths come from generated keys only.
 */
export function createLocalObjectStore(root: string): ObjectStore {
  return {
    async delete(key) {
      await rm(objectPath(root, key), { force: true });
    },
    async get(key) {
      try {
        return await readFile(objectPath(root, key));
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }
        throw error;
      }
    },
    async put(key, bytes) {
      await mkdir(root, { recursive: true });
      const path = objectPath(root, key);
      const partial = `${path}.partial`;
      await writeFile(partial, bytes);
      await rename(partial, path);
    },
  };
}
