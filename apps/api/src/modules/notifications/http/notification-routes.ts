import {
  markReadRequestSchema,
  notificationQuerySchema,
  type UnreadCountResponse,
} from "@twitter-clone/contracts";

import { AppError } from "../../../platform/http/errors.js";
import { InvalidKeysetCursorError } from "../../../platform/pagination/signed-keyset-cursor.js";
import { authContext, type AuthGuard } from "../../auth/http/authentication.js";
import {
  type AuthRateLimit,
  authRateLimitConfig,
} from "../../auth/http/rate-limit.js";
import { parseBody } from "../../auth/http/validation.js";

import type { NotificationUseCases } from "../application/notification-use-cases.js";
import type { FastifyInstance } from "fastify";

/** API starting points per client address; the count is polled by the badge. */
export const DEFAULT_NOTIFICATION_RATE_LIMITS = {
  count: { max: 240, timeWindowMs: 60_000 },
  list: { max: 120, timeWindowMs: 60_000 },
  write: { max: 60, timeWindowMs: 60_000 },
} as const satisfies Record<string, AuthRateLimit>;

export interface NotificationRouteDependencies {
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  notifications: NotificationUseCases;
  rateLimits?: Partial<Record<"count" | "list" | "write", AuthRateLimit>>;
}

/**
 * The signed-in member's notifications (NOT-01). Mounted under `/v1`.
 *
 * - `GET /notifications?cursor=&limit=`: newest first, viewer-bound cursor.
 * - `GET /notifications/unread-count`: the badge count.
 * - `POST /notifications/read` `{ ids }` or `{ all: true }`: marks read
 *   (CSRF required) and answers the committed unread count.
 *
 * Every answer is the session member's own and `no-store`.
 */
export async function notificationRoutes(
  app: FastifyInstance,
  deps: NotificationRouteDependencies,
): Promise<void> {
  const limit = (name: "count" | "list" | "write") => ({
    rateLimit: authRateLimitConfig(
      deps.rateLimits?.[name] ?? DEFAULT_NOTIFICATION_RATE_LIMITS[name],
    ),
  });

  app.get(
    "/notifications",
    { config: limit("list"), preHandler: deps.requireSession },
    async (request, reply) => {
      void reply.header("cache-control", "no-store");
      const query = notificationQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw new AppError("MALFORMED_REQUEST", "Invalid notifications query.");
      }
      try {
        return await deps.notifications.list(
          authContext(request).user.id,
          query.data.limit,
          query.data.cursor,
        );
      } catch (error: unknown) {
        if (error instanceof InvalidKeysetCursorError) {
          throw new AppError(
            "MALFORMED_REQUEST",
            "Invalid notifications cursor.",
          );
        }
        throw error;
      }
    },
  );

  app.get(
    "/notifications/unread-count",
    { config: limit("count"), preHandler: deps.requireSession },
    async (request, reply) => {
      const body: UnreadCountResponse = {
        unreadCount: await deps.notifications.unreadCount(
          authContext(request).user.id,
        ),
      };
      return reply.header("cache-control", "no-store").send(body);
    },
  );

  app.post(
    "/notifications/read",
    {
      config: limit("write"),
      preHandler: [deps.requireSession, deps.requireCsrf],
    },
    async (request, reply) => {
      const input = parseBody(markReadRequestSchema, request.body);
      const body: UnreadCountResponse = {
        unreadCount: await deps.notifications.markRead(
          authContext(request).user.id,
          input,
        ),
      };
      return reply.header("cache-control", "no-store").send(body);
    },
  );
}
