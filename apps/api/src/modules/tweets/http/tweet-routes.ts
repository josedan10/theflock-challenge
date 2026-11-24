import {
  createTweetRequestSchema,
  type CreateTweetResponse,
} from "@twitter-clone/contracts";
import { z } from "zod";

import { AppError } from "../../../platform/http/errors.js";
import { authContext, type AuthGuard } from "../../auth/http/authentication.js";
import {
  type AuthRateLimit,
  authRateLimitConfig,
} from "../../auth/http/rate-limit.js";
import { parseBody } from "../../auth/http/validation.js";
import { NotTweetAuthorError, TweetNotFoundError } from "../domain/errors.js";

import { toTweet } from "./tweet-card.js";

import type { CreateTweet } from "../application/create-tweet.js";
import type { DeleteTweet } from "../application/delete-tweet.js";
import type { FastifyInstance } from "fastify";

/** API starting point: 20/minute per client, applied to create and to delete separately. */
export const DEFAULT_TWEET_WRITE_RATE_LIMIT: AuthRateLimit = {
  max: 20,
  timeWindowMs: 60_000,
};

export interface TweetRouteDependencies {
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  createTweet: CreateTweet;
  deleteTweet: DeleteTweet;
  writeRateLimit?: AuthRateLimit;
}

const tweetIdSchema = z.uuid();

/**
 * `POST /tweets` and `DELETE /tweets/:id` (US-B01, US-B02). Mounted under `/v1`.
 *
 * The author is always the session member; the body cannot name one. Both
 * routes are cookie-authenticated mutations, so both require the CSRF token.
 */
export async function tweetRoutes(
  app: FastifyInstance,
  dependencies: TweetRouteDependencies,
): Promise<void> {
  const writeConfig = {
    config: {
      rateLimit: authRateLimitConfig(
        dependencies.writeRateLimit ?? DEFAULT_TWEET_WRITE_RATE_LIMIT,
      ),
    },
    preHandler: [dependencies.requireSession, dependencies.requireCsrf],
  };

  app.post("/tweets", writeConfig, async (request, reply) => {
    const { content } = parseBody(createTweetRequestSchema, request.body);
    const auth = authContext(request);
    const card = await dependencies.createTweet({
      authorId: auth.user.id,
      content,
    });
    // Ids only: tweet text is user content and stays out of logs.
    request.log.info(
      { authorId: auth.user.id, tweetId: card.id },
      "tweet created",
    );
    const body: CreateTweetResponse = { tweet: toTweet(card) };
    return reply.code(201).header("cache-control", "no-store").send(body);
  });

  app.delete<{ Params: { id: string } }>(
    "/tweets/:id",
    writeConfig,
    async (request, reply) => {
      const auth = authContext(request);
      // A malformed id cannot name a tweet: answer like an unknown one, and
      // never let it reach the database's uuid cast.
      const tweetId = tweetIdSchema.safeParse(request.params.id);
      if (!tweetId.success) {
        throw new AppError("NOT_FOUND", "That tweet does not exist.");
      }
      try {
        await dependencies.deleteTweet({
          memberId: auth.user.id,
          tweetId: tweetId.data,
        });
      } catch (error: unknown) {
        if (error instanceof TweetNotFoundError) {
          throw new AppError("NOT_FOUND", "That tweet does not exist.");
        }
        if (error instanceof NotTweetAuthorError) {
          throw new AppError(
            "FORBIDDEN",
            "You can only delete your own tweets.",
          );
        }
        throw error;
      }
      request.log.info(
        { memberId: auth.user.id, tweetId: tweetId.data },
        "tweet deleted",
      );
      return reply.code(204).header("cache-control", "no-store").send();
    },
  );
}
