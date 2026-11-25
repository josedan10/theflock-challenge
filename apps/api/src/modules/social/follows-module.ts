import { createFollowMember } from "./application/follow-member.js";
import { createUnfollowMember } from "./application/unfollow-member.js";
import { followRoutes } from "./http/follow-routes.js";
import { createDrizzleFollowRepository } from "./infrastructure/drizzle-follow-repository.js";

import type { Database } from "../../platform/database/client.js";
import type { AuthGuard } from "../auth/http/authentication.js";
import type { AuthRateLimit } from "../auth/http/rate-limit.js";
import type { FastifyInstance } from "fastify";

export interface FollowsModuleOptions {
  db: Database;
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  /** Injected for deterministic tests; defaults to the system clock. */
  clock?: () => Date;
  writeRateLimit?: AuthRateLimit;
}

/** Composition root for follow and unfollow. */
export function followsModule(options: FollowsModuleOptions) {
  const follows = createDrizzleFollowRepository(options.db);
  const followMember = createFollowMember({
    clock: options.clock ?? (() => new Date()),
    follows,
  });
  const unfollowMember = createUnfollowMember({ follows });

  return async (app: FastifyInstance): Promise<void> => {
    await followRoutes(app, {
      followMember,
      requireCsrf: options.requireCsrf,
      requireSession: options.requireSession,
      unfollowMember,
      ...(options.writeRateLimit === undefined
        ? {}
        : { writeRateLimit: options.writeRateLimit }),
    });
  };
}
