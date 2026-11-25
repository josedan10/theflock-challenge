import { followListQuerySchema } from "@twitter-clone/contracts";

import { AppError } from "../../../platform/http/errors.js";
import { InvalidKeysetCursorError } from "../../../platform/pagination/signed-keyset-cursor.js";
import { type AuthGuard, viewerId } from "../../auth/http/authentication.js";
import {
  type AuthRateLimit,
  authRateLimitConfig,
} from "../../auth/http/rate-limit.js";
import { FollowTargetNotFoundError } from "../domain/errors.js";

import type { ListFollows } from "../application/list-follows.js";
import type { FollowListDirection } from "../application/ports.js";
import type { FastifyInstance } from "fastify";

/** API starting point for list reads: 120/minute per client, like profiles. */
export const DEFAULT_FOLLOW_LIST_READ_RATE_LIMIT: AuthRateLimit = {
  max: 120,
  timeWindowMs: 60_000,
};

export interface FollowListRouteDependencies {
  optionalSession: AuthGuard;
  listFollows: ListFollows;
  readRateLimit?: AuthRateLimit;
}

/**
 * `GET /users/:username/followers` and `/following` (US-C03). Mounted under
 * `/v1`.
 *
 * The lists are public. A session is optional and only adds the viewer's
 * relationship to each row, so the body is `no-store`. Unknown, malformed,
 * and soft-deleted usernames are `404`; a bad query or a cursor from another
 * list is `400 MALFORMED_REQUEST`.
 */
export async function followListRoutes(
  app: FastifyInstance,
  dependencies: FollowListRouteDependencies,
): Promise<void> {
  const readConfig = {
    config: {
      rateLimit: authRateLimitConfig(
        dependencies.readRateLimit ?? DEFAULT_FOLLOW_LIST_READ_RATE_LIMIT,
      ),
    },
    preHandler: dependencies.optionalSession,
  };

  for (const direction of [
    "followers",
    "following",
  ] as const satisfies readonly FollowListDirection[]) {
    app.get<{ Params: { username: string } }>(
      `/users/:username/${direction}`,
      readConfig,
      async (request, reply) => {
        void reply.header("cache-control", "no-store");
        const query = followListQuerySchema.safeParse(request.query);
        if (!query.success) {
          throw new AppError("MALFORMED_REQUEST", "Invalid list query.");
        }
        try {
          const page = await dependencies.listFollows({
            direction,
            limit: query.data.limit,
            username: request.params.username,
            viewerId: viewerId(request),
            ...(query.data.cursor === undefined
              ? {}
              : { cursor: query.data.cursor }),
          });
          return reply.send(page);
        } catch (error: unknown) {
          if (error instanceof FollowTargetNotFoundError) {
            throw new AppError("NOT_FOUND", "That profile does not exist.");
          }
          if (error instanceof InvalidKeysetCursorError) {
            throw new AppError("MALFORMED_REQUEST", "Invalid list cursor.");
          }
          throw error;
        }
      },
    );
  }
}
