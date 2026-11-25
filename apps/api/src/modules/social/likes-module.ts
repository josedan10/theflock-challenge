import { createLikeTweet } from "./application/like-tweet.js";
import { createUnlikeTweet } from "./application/unlike-tweet.js";
import { likeRoutes } from "./http/like-routes.js";
import { createDrizzleLikeRepository } from "./infrastructure/drizzle-like-repository.js";

import type { Database } from "../../platform/database/client.js";
import type { AuthGuard } from "../auth/http/authentication.js";
import type { AuthRateLimit } from "../auth/http/rate-limit.js";
import type { FastifyInstance } from "fastify";

export interface LikesModuleOptions {
  db: Database;
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  /** Injected for deterministic tests; defaults to the system clock. */
  clock?: () => Date;
  writeRateLimit?: AuthRateLimit;
}

/** Composition root for like and unlike. */
export function likesModule(options: LikesModuleOptions) {
  const likes = createDrizzleLikeRepository(options.db);
  const likeTweet = createLikeTweet({
    clock: options.clock ?? (() => new Date()),
    likes,
  });
  const unlikeTweet = createUnlikeTweet({ likes });

  return async (app: FastifyInstance): Promise<void> => {
    await likeRoutes(app, {
      likeTweet,
      requireCsrf: options.requireCsrf,
      requireSession: options.requireSession,
      unlikeTweet,
      ...(options.writeRateLimit === undefined
        ? {}
        : { writeRateLimit: options.writeRateLimit }),
    });
  };
}
