import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";

import {
  type AuthModuleOptions,
  createAuthRuntime,
} from "./modules/auth/auth-module.js";
import { notificationsModule } from "./modules/notifications/notifications-module.js";
import { followListsModule } from "./modules/social/follow-lists-module.js";
import { followsModule } from "./modules/social/follows-module.js";
import { likesModule } from "./modules/social/likes-module.js";
import { createTimelineLiveRuntime } from "./modules/timeline/timeline-live-runtime.js";
import { timelineModule } from "./modules/timeline/timeline-module.js";
import { tweetsModule } from "./modules/tweets/tweets-module.js";
import { usersModule } from "./modules/users/users-module.js";
import { registerErrorHandling } from "./platform/http/errors.js";

import type { AuthRateLimit } from "./modules/auth/http/rate-limit.js";
import type { ProfileRateLimit } from "./modules/users/http/rate-limit.js";

export interface BuildAppOptions {
  /** Mounts the auth routes under `/v1`; omitted only by platform-level tests. */
  auth?: AuthModuleOptions;
  corsOrigin: string;
  logger?: boolean;
  /** Overrides for profile read, update and search budgets. Defaults are the API starting points. */
  profileRateLimit?: {
    read?: ProfileRateLimit;
    write?: ProfileRateLimit;
    search?: ProfileRateLimit;
  };
  readinessCheck?: () => Promise<boolean>;
  /** Proxies allowed to set `X-Forwarded-For`; see `TRUST_PROXY`. */
  trustProxy?: string[];
  /** Override for the follow/unfollow budget. Default: 60/minute, separately. */
  followWriteRateLimit?: AuthRateLimit;
  /** Overrides for notification list, unread-count and mark-read budgets. */
  notificationRateLimits?: Partial<
    Record<"count" | "list" | "write", AuthRateLimit>
  >;
  /** Override for the followers/following read budget. Default: 120/minute. */
  followListRateLimit?: AuthRateLimit;
  /** Override for the like/unlike budget. Default: 60/minute, separately. */
  likeWriteRateLimit?: AuthRateLimit;
  /** Override for the home-timeline read budget. Default: 120/minute. */
  timelineRateLimit?: AuthRateLimit;
  /** Override for opening the live timeline stream. Default: 30/minute. */
  timelineStreamRateLimit?: AuthRateLimit;
  /** Test overrides for SSE heartbeat and per-viewer connection cap. */
  timelineLive?: {
    heartbeatMs?: number;
    maxConnectionsPerViewer?: number;
  };
  /** Override for the tweet create/delete budget. Default: 20/minute. */
  tweetWriteRateLimit?: AuthRateLimit;
}

/** Creates an injectable API instance with the platform security baseline. */
export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1_048_576,
    logger: options.logger
      ? {
          serializers: {
            // Log the route template only: query strings can contain signed cursors.
            req(request) {
              return {
                method: request.method,
                url: request.routeOptions.url ?? "(unmatched)",
              };
            },
          },
        }
      : false,
    requestIdHeader: "x-request-id",
    trustProxy: options.trustProxy ?? false,
  });

  registerErrorHandling(app);
  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    origin(origin, callback) {
      callback(null, origin === undefined || origin === options.corsOrigin);
    },
  });

  await app.register(cookie);
  // Opt-in per route: only routes that declare `config.rateLimit` are limited.
  await app.register(rateLimit, { global: false });
  if (options.auth !== undefined) {
    const auth = createAuthRuntime(options.auth);
    await app.register(auth.plugin, { prefix: "/v1" });
    const timelineLive = createTimelineLiveRuntime({
      db: options.auth.db,
      sessionSecret: options.auth.sessionSecret,
      ...(options.timelineLive?.heartbeatMs === undefined
        ? {}
        : { heartbeatMs: options.timelineLive.heartbeatMs }),
      ...(options.timelineLive?.maxConnectionsPerViewer === undefined
        ? {}
        : {
            maxConnectionsPerViewer:
              options.timelineLive.maxConnectionsPerViewer,
          }),
    });
    app.addHook("onClose", async () => timelineLive.close());
    await app.register(
      timelineModule({
        corsOrigin: options.corsOrigin,
        db: options.auth.db,
        live: timelineLive,
        requireSession: auth.requireSession,
        sessionSecret: options.auth.sessionSecret,
        ...(options.timelineRateLimit === undefined
          ? {}
          : { rateLimit: options.timelineRateLimit }),
        ...(options.timelineStreamRateLimit === undefined
          ? {}
          : { streamRateLimit: options.timelineStreamRateLimit }),
      }),
      { prefix: "/v1" },
    );
    await app.register(
      usersModule({
        db: options.auth.db,
        requireCsrf: auth.requireCsrf,
        requireSession: auth.requireSession,
        ...(options.auth.clock === undefined
          ? {}
          : { clock: options.auth.clock }),
        ...(options.profileRateLimit?.read === undefined
          ? {}
          : { readRateLimit: options.profileRateLimit.read }),
        ...(options.profileRateLimit?.write === undefined
          ? {}
          : { writeRateLimit: options.profileRateLimit.write }),
        ...(options.profileRateLimit?.search === undefined
          ? {}
          : { searchRateLimit: options.profileRateLimit.search }),
      }),
      { prefix: "/v1" },
    );
    await app.register(
      followsModule({
        db: options.auth.db,
        requireCsrf: auth.requireCsrf,
        requireSession: auth.requireSession,
        ...(options.auth.clock === undefined
          ? {}
          : { clock: options.auth.clock }),
        ...(options.followWriteRateLimit === undefined
          ? {}
          : { writeRateLimit: options.followWriteRateLimit }),
      }),
      { prefix: "/v1" },
    );
    await app.register(
      followListsModule({
        db: options.auth.db,
        optionalSession: auth.optionalSession,
        sessionSecret: options.auth.sessionSecret,
        ...(options.followListRateLimit === undefined
          ? {}
          : { readRateLimit: options.followListRateLimit }),
      }),
      { prefix: "/v1" },
    );
    await app.register(
      notificationsModule({
        db: options.auth.db,
        requireCsrf: auth.requireCsrf,
        requireSession: auth.requireSession,
        sessionSecret: options.auth.sessionSecret,
        ...(options.auth.clock === undefined
          ? {}
          : { clock: options.auth.clock }),
        ...(options.notificationRateLimits === undefined
          ? {}
          : { rateLimits: options.notificationRateLimits }),
      }),
      { prefix: "/v1" },
    );
    await app.register(
      likesModule({
        db: options.auth.db,
        requireCsrf: auth.requireCsrf,
        requireSession: auth.requireSession,
        ...(options.auth.clock === undefined
          ? {}
          : { clock: options.auth.clock }),
        ...(options.likeWriteRateLimit === undefined
          ? {}
          : { writeRateLimit: options.likeWriteRateLimit }),
      }),
      { prefix: "/v1" },
    );
    await app.register(
      tweetsModule({
        optionalSession: auth.optionalSession,
        sessionSecret: options.auth.sessionSecret,
        db: options.auth.db,
        requireCsrf: auth.requireCsrf,
        requireSession: auth.requireSession,
        onTweetCreated: (tweet) => timelineLive.publish(tweet),
        ...(options.auth.clock === undefined
          ? {}
          : { clock: options.auth.clock }),
        ...(options.tweetWriteRateLimit === undefined
          ? {}
          : { writeRateLimit: options.tweetWriteRateLimit }),
      }),
      { prefix: "/v1" },
    );
  }

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    const ready = (await options.readinessCheck?.()) ?? true;

    if (!ready) {
      return reply.code(503).send({ status: "unavailable" });
    }

    return { status: "ready" };
  });

  return app;
}
