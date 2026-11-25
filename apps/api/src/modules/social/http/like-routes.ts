import { type LikeResponse } from "@twitter-clone/contracts";
import { z } from "zod";

import { AppError } from "../../../platform/http/errors.js";
import { authContext, type AuthGuard } from "../../auth/http/authentication.js";
import {
  type AuthRateLimit,
  authRateLimitConfig,
} from "../../auth/http/rate-limit.js";
import { LikeTargetNotFoundError } from "../domain/errors.js";

import type { LikeTweet } from "../application/like-tweet.js";
import type { LikeState } from "../application/ports.js";
import type { UnlikeTweet } from "../application/unlike-tweet.js";
import type { FastifyInstance, FastifyReply } from "fastify";

/** API starting point: 60/minute per client, applied to like and unlike separately. */
export const DEFAULT_LIKE_WRITE_RATE_LIMIT: AuthRateLimit = {
  max: 60,
  timeWindowMs: 60_000,
};

export interface LikeRouteDependencies {
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  likeTweet: LikeTweet;
  unlikeTweet: UnlikeTweet;
  writeRateLimit?: AuthRateLimit;
}

const tweetIdSchema = z.uuid();

function notFound(): never {
  throw new AppError("NOT_FOUND", "That tweet does not exist.");
}

/** A malformed id cannot name a tweet and never reaches the uuid cast. */
function parseTweetId(raw: string): string {
  const parsed = tweetIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : notFound();
}

function sendState(reply: FastifyReply, state: LikeState) {
  const body: LikeResponse = {
    like: { likeCount: state.likeCount, liked: state.liked },
  };
  return reply.code(200).header("cache-control", "no-store").send(body);
}

/**
 * `PUT` and `DELETE /tweets/:id/like` (US-C02). Mounted under `/v1`.
 *
 * The member is always the session member. Both routes are cookie-authenticated
 * mutations, so both require the CSRF token. Each answers `200` with the
 * canonical state and count, including a repeat of the same command.
 */
export async function likeRoutes(
  app: FastifyInstance,
  dependencies: LikeRouteDependencies,
): Promise<void> {
  const writeConfig = {
    config: {
      rateLimit: authRateLimitConfig(
        dependencies.writeRateLimit ?? DEFAULT_LIKE_WRITE_RATE_LIMIT,
      ),
    },
    preHandler: [dependencies.requireSession, dependencies.requireCsrf],
  };

  app.put<{ Params: { id: string } }>(
    "/tweets/:id/like",
    writeConfig,
    async (request, reply) => {
      const memberId = authContext(request).user.id;
      const tweetId = parseTweetId(request.params.id);
      try {
        const state = await dependencies.likeTweet({ memberId, tweetId });
        request.log.info({ memberId, tweetId }, "tweet liked");
        return sendState(reply, state);
      } catch (error: unknown) {
        if (error instanceof LikeTargetNotFoundError) {
          notFound();
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/tweets/:id/like",
    writeConfig,
    async (request, reply) => {
      const memberId = authContext(request).user.id;
      const tweetId = parseTweetId(request.params.id);
      try {
        const state = await dependencies.unlikeTweet({ memberId, tweetId });
        request.log.info({ memberId, tweetId }, "tweet unliked");
        return sendState(reply, state);
      } catch (error: unknown) {
        if (error instanceof LikeTargetNotFoundError) {
          notFound();
        }
        throw error;
      }
    },
  );
}
