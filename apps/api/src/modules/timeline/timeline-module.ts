import {
  timelineQuerySchema,
  type TimelinePage,
} from "@twitter-clone/contracts";

import { AppError } from "../../platform/http/errors.js";
import { authContext, type AuthGuard } from "../auth/http/authentication.js";
import {
  type AuthRateLimit,
  authRateLimitConfig,
} from "../auth/http/rate-limit.js";

import {
  createReadTimeline,
  InvalidTimelineCursorError,
} from "./application/read-timeline.js";
import { createReadTimelineRows } from "./infrastructure/drizzle-timeline.js";
import { createTimelineCursor } from "./infrastructure/signed-timeline-cursor.js";

import type { Database } from "../../platform/database/client.js";
import type { FastifyInstance } from "fastify";

/** API starting point for home-timeline reads: 120/minute per client address. */
export const DEFAULT_TIMELINE_READ_RATE_LIMIT: AuthRateLimit = {
  max: 120,
  timeWindowMs: 60_000,
};

export interface TimelineModuleOptions {
  db: Database;
  sessionSecret: string;
  requireSession: AuthGuard;
  /** Override used by tests. Production keeps the starting budget. */
  rateLimit?: AuthRateLimit;
}

/** GET /v1/timeline uses only the session member to determine feed eligibility. */
export function timelineModule(options: TimelineModuleOptions) {
  const read = createReadTimeline(
    createReadTimelineRows(options.db),
    createTimelineCursor(options.sessionSecret),
  );
  const readLimit = authRateLimitConfig(
    options.rateLimit ?? DEFAULT_TIMELINE_READ_RATE_LIMIT,
  );
  return async (app: FastifyInstance): Promise<void> => {
    app.get(
      "/timeline",
      {
        config: { rateLimit: readLimit },
        preHandler: options.requireSession,
      },
      async (request, reply) => {
        void reply.header("cache-control", "no-store");
        const query = timelineQuerySchema.safeParse(request.query);
        if (!query.success) {
          throw new AppError("MALFORMED_REQUEST", "Invalid timeline query.");
        }
        try {
          const page: TimelinePage = await read(
            authContext(request).user.id,
            query.data.limit,
            query.data.cursor,
          );
          return reply.send(page);
        } catch (error: unknown) {
          if (error instanceof InvalidTimelineCursorError) {
            throw new AppError("MALFORMED_REQUEST", "Invalid timeline cursor.");
          }
          throw error;
        }
      },
    );
  };
}
