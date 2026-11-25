import { type FollowResponse } from "@twitter-clone/contracts";

import { authContext, type AuthGuard } from "../../auth/http/authentication.js";
import {
  type AuthRateLimit,
  authRateLimitConfig,
} from "../../auth/http/rate-limit.js";

import { mapFollowError } from "./follow-error.js";

import type { FollowMember } from "../application/follow-member.js";
import type { UnfollowMember } from "../application/unfollow-member.js";
import type { FastifyInstance } from "fastify";

/** API starting point: 60/minute per client, applied to follow and unfollow separately. */
export const DEFAULT_FOLLOW_WRITE_RATE_LIMIT: AuthRateLimit = {
  max: 60,
  timeWindowMs: 60_000,
};

export interface FollowRouteDependencies {
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  followMember: FollowMember;
  unfollowMember: UnfollowMember;
  writeRateLimit?: AuthRateLimit;
}

/**
 * `PUT` and `DELETE /users/:username/follow` (US-C01). Mounted under `/v1`.
 *
 * The follower is always the session member. Both routes are
 * cookie-authenticated mutations, so both require the CSRF token. Each answers
 * `200` with the canonical relationship, including a repeat of the same command.
 */
export async function followRoutes(
  app: FastifyInstance,
  dependencies: FollowRouteDependencies,
): Promise<void> {
  const writeConfig = {
    config: {
      rateLimit: authRateLimitConfig(
        dependencies.writeRateLimit ?? DEFAULT_FOLLOW_WRITE_RATE_LIMIT,
      ),
    },
    preHandler: [dependencies.requireSession, dependencies.requireCsrf],
  };

  app.put<{ Params: { username: string } }>(
    "/users/:username/follow",
    writeConfig,
    async (request, reply) => {
      const followerId = authContext(request).user.id;
      try {
        const relationship = await dependencies.followMember({
          followerId,
          username: request.params.username,
        });
        request.log.info(
          { followerId, followingId: relationship.targetId },
          "member followed",
        );
        const body: FollowResponse = {
          relationship: {
            followerCount: relationship.followerCount,
            following: relationship.following,
          },
        };
        return reply.code(200).header("cache-control", "no-store").send(body);
      } catch (error: unknown) {
        mapFollowError(error);
      }
    },
  );

  app.delete<{ Params: { username: string } }>(
    "/users/:username/follow",
    writeConfig,
    async (request, reply) => {
      const followerId = authContext(request).user.id;
      try {
        const relationship = await dependencies.unfollowMember({
          followerId,
          username: request.params.username,
        });
        request.log.info(
          { followerId, followingId: relationship.targetId },
          "member unfollowed",
        );
        const body: FollowResponse = {
          relationship: {
            followerCount: relationship.followerCount,
            following: relationship.following,
          },
        };
        return reply.code(200).header("cache-control", "no-store").send(body);
      } catch (error: unknown) {
        mapFollowError(error);
      }
    },
  );
}
