import { createSignedKeysetCursor } from "../../platform/pagination/signed-keyset-cursor.js";

import { createListFollows } from "./application/list-follows.js";
import { followListRoutes } from "./http/follow-list-routes.js";
import { createDrizzleFollowListReader } from "./infrastructure/drizzle-follow-list.js";

import type { Database } from "../../platform/database/client.js";
import type { AuthGuard } from "../auth/http/authentication.js";
import type { AuthRateLimit } from "../auth/http/rate-limit.js";
import type { FastifyInstance } from "fastify";

export interface FollowListsModuleOptions {
  db: Database;
  optionalSession: AuthGuard;
  /** Keys list cursors under their own label (`SESSION_SECRET`). */
  sessionSecret: string;
  readRateLimit?: AuthRateLimit;
}

/** Composition root for the followers and following lists. */
export function followListsModule(options: FollowListsModuleOptions) {
  const listFollows = createListFollows({
    cursors: createSignedKeysetCursor(
      options.sessionSecret,
      "follow-list/cursor-key",
    ),
    reader: createDrizzleFollowListReader(options.db),
  });

  return async (app: FastifyInstance): Promise<void> => {
    await followListRoutes(app, {
      listFollows,
      optionalSession: options.optionalSession,
      ...(options.readRateLimit === undefined
        ? {}
        : { readRateLimit: options.readRateLimit }),
    });
  };
}
