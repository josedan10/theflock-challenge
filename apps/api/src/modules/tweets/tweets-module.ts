import { v7 as uuidv7 } from "uuid";

import { createSignedKeysetCursor } from "../../platform/pagination/signed-keyset-cursor.js";

import { createCreateTweet } from "./application/create-tweet.js";
import { createDeleteTweet } from "./application/delete-tweet.js";
import { createReadThread } from "./application/read-thread.js";
import { threadRoutes } from "./http/thread-routes.js";
import { tweetRoutes } from "./http/tweet-routes.js";
import { createThreadReader } from "./infrastructure/drizzle-thread-reader.js";
import { createDrizzleTweetRepository } from "./infrastructure/drizzle-tweet-repository.js";

import type { Database } from "../../platform/database/client.js";
import type { AuthGuard } from "../auth/http/authentication.js";
import type { AuthRateLimit } from "../auth/http/rate-limit.js";
import type { ObjectStore } from "../media/application/ports.js";
import type { FastifyInstance } from "fastify";

export interface TweetsModuleOptions {
  db: Database;
  optionalSession: AuthGuard;
  sessionSecret: string;
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  /** Injected for deterministic tests; defaults to the system clock. */
  clock?: () => Date;
  writeRateLimit?: AuthRateLimit;
  /** LIVE-01: fan-out after a successful create, including replies. */
  onTweetCreated?: (tweet: {
    id: string;
    authorId: string;
    createdAt: Date;
  }) => Promise<void> | void;
  mediaOrigin: string;
  uploadsEnabled: boolean;
  objects?: ObjectStore;
}

/** Composition root for publishing and deleting tweets. */
export function tweetsModule(options: TweetsModuleOptions) {
  const tweets = createDrizzleTweetRepository(options.db);
  const createTweet = createCreateTweet({
    clock: options.clock ?? (() => new Date()),
    generateId: uuidv7,
    tweets,
    ...(options.onTweetCreated === undefined
      ? {}
      : { onCreated: options.onTweetCreated }),
  });
  const deleteTweet = createDeleteTweet(tweets, options.objects);

  return async (app: FastifyInstance): Promise<void> => {
    await threadRoutes(app, {
      requireSession: options.requireSession,
      requireCsrf: options.requireCsrf,
      optionalSession: options.optionalSession,
      ...(options.writeRateLimit === undefined
        ? {}
        : { writeRateLimit: options.writeRateLimit }),
      createTweet,
      read: createReadThread(
        createThreadReader(options.db, options.mediaOrigin),
        createSignedKeysetCursor(
          options.sessionSecret,
          "tweet-thread/cursor-key",
        ),
      ),
      mediaOrigin: options.mediaOrigin,
      uploadsEnabled: options.uploadsEnabled,
    });
    await tweetRoutes(app, {
      createTweet,
      deleteTweet,
      mediaOrigin: options.mediaOrigin,
      uploadsEnabled: options.uploadsEnabled,
      requireCsrf: options.requireCsrf,
      requireSession: options.requireSession,
      ...(options.writeRateLimit === undefined
        ? {}
        : { writeRateLimit: options.writeRateLimit }),
    });
  };
}
