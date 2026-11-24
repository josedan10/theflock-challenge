import { v7 as uuidv7 } from "uuid";

import { createCreateTweet } from "./application/create-tweet.js";
import { createDeleteTweet } from "./application/delete-tweet.js";
import { tweetRoutes } from "./http/tweet-routes.js";
import { createDrizzleTweetRepository } from "./infrastructure/drizzle-tweet-repository.js";

import type { Database } from "../../platform/database/client.js";
import type { AuthGuard } from "../auth/http/authentication.js";
import type { AuthRateLimit } from "../auth/http/rate-limit.js";
import type { FastifyInstance } from "fastify";

export interface TweetsModuleOptions {
  db: Database;
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  /** Injected for deterministic tests; defaults to the system clock. */
  clock?: () => Date;
  writeRateLimit?: AuthRateLimit;
}

/** Composition root for publishing and deleting tweets. */
export function tweetsModule(options: TweetsModuleOptions) {
  const tweets = createDrizzleTweetRepository(options.db);
  const createTweet = createCreateTweet({
    clock: options.clock ?? (() => new Date()),
    generateId: uuidv7,
    tweets,
  });
  const deleteTweet = createDeleteTweet(tweets);

  return async (app: FastifyInstance): Promise<void> => {
    await tweetRoutes(app, {
      createTweet,
      deleteTweet,
      requireCsrf: options.requireCsrf,
      requireSession: options.requireSession,
      ...(options.writeRateLimit === undefined
        ? {}
        : { writeRateLimit: options.writeRateLimit }),
    });
  };
}
