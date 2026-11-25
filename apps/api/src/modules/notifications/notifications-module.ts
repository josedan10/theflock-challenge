import { createSignedKeysetCursor } from "../../platform/pagination/signed-keyset-cursor.js";

import { createNotificationUseCases } from "./application/notification-use-cases.js";
import { notificationRoutes } from "./http/notification-routes.js";
import { createDrizzleNotificationStore } from "./infrastructure/drizzle-notification-store.js";

import type { Database } from "../../platform/database/client.js";
import type { AuthGuard } from "../auth/http/authentication.js";
import type { AuthRateLimit } from "../auth/http/rate-limit.js";
import type { FastifyInstance } from "fastify";

export interface NotificationsModuleOptions {
  db: Database;
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  /** Keys notification cursors under their own label (`SESSION_SECRET`). */
  sessionSecret: string;
  /** Injected for deterministic tests; defaults to the system clock. */
  clock?: () => Date;
  rateLimits?: Partial<Record<"count" | "list" | "write", AuthRateLimit>>;
}

/** Composition root for reading and clearing notifications. */
export function notificationsModule(options: NotificationsModuleOptions) {
  const notifications = createNotificationUseCases({
    clock: options.clock ?? (() => new Date()),
    cursors: createSignedKeysetCursor(
      options.sessionSecret,
      "notifications/cursor-key",
    ),
    store: createDrizzleNotificationStore(options.db),
  });

  return async (app: FastifyInstance): Promise<void> => {
    await notificationRoutes(app, {
      notifications,
      requireCsrf: options.requireCsrf,
      requireSession: options.requireSession,
      ...(options.rateLimits === undefined
        ? {}
        : { rateLimits: options.rateLimits }),
    });
  };
}
