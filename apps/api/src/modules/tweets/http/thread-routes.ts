import {
  createTweetRequestSchema,
  threadIdSchema,
  threadQuerySchema,
  type CreateTweetResponse,
} from "@twitter-clone/contracts";

import { AppError } from "../../../platform/http/errors.js";
import { InvalidKeysetCursorError } from "../../../platform/pagination/signed-keyset-cursor.js";
import { authContext, type AuthGuard } from "../../auth/http/authentication.js";
import {
  authRateLimitConfig,
  type AuthRateLimit,
} from "../../auth/http/rate-limit.js";
import { parseBody } from "../../auth/http/validation.js";
import { ImageUnavailableError } from "../../media/domain/image-policy.js";
import { TweetNotFoundError } from "../domain/errors.js";

import { toTweet } from "./tweet-card.js";
import { DEFAULT_TWEET_WRITE_RATE_LIMIT } from "./tweet-routes.js";

import type { CreateTweet } from "../application/create-tweet.js";
import type { createReadThread } from "../application/read-thread.js";
import type { FastifyInstance } from "fastify";

function tweetId(raw: string) {
  const parsed = threadIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("NOT_FOUND", new TweetNotFoundError().message);
  }
  return parsed.data;
}

function mapError(error: unknown): never {
  if (error instanceof TweetNotFoundError) {
    throw new AppError("NOT_FOUND", error.message);
  }
  if (error instanceof ImageUnavailableError) {
    throw new AppError("VALIDATION_ERROR", error.message, {
      image: [error.message],
    });
  }
  if (error instanceof InvalidKeysetCursorError) {
    throw new AppError("MALFORMED_REQUEST", "Invalid thread cursor.");
  }
  throw error;
}

export async function threadRoutes(
  app: FastifyInstance,
  deps: {
    read: ReturnType<typeof createReadThread>;
    createTweet: CreateTweet;
    optionalSession: AuthGuard;
    requireSession: AuthGuard;
    requireCsrf: AuthGuard;
    mediaOrigin: string;
    uploadsEnabled: boolean;
    writeRateLimit?: AuthRateLimit;
  },
) {
  app.get<{ Params: { id: string } }>(
    "/tweets/:id/thread",
    {
      config: { rateLimit: { max: 120, timeWindow: 60_000 } },
      preHandler: deps.optionalSession,
    },
    async (req, reply) => {
      void reply.header("cache-control", "no-store");
      const id = tweetId(req.params.id);
      const query = threadQuerySchema.safeParse(req.query);
      if (!query.success) {
        throw new AppError("MALFORMED_REQUEST", "Invalid thread query.");
      }
      try {
        return reply.send(
          await deps.read(
            id,
            req.auth?.user.id ?? null,
            query.data.limit,
            query.data.cursor,
          ),
        );
      } catch (e: unknown) {
        mapError(e);
      }
    },
  );
  app.post<{ Params: { id: string } }>(
    "/tweets/:id/replies",
    {
      config: {
        rateLimit: authRateLimitConfig(
          deps.writeRateLimit ?? DEFAULT_TWEET_WRITE_RATE_LIMIT,
        ),
      },
      preHandler: [deps.requireSession, deps.requireCsrf],
    },
    async (req, reply) => {
      const parentTweetId = tweetId(req.params.id);
      const { content, image } = parseBody(createTweetRequestSchema, req.body);
      if (image !== undefined && !deps.uploadsEnabled) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Image uploads are not enabled.",
          {
            image: ["Image uploads are not enabled."],
          },
        );
      }
      try {
        const card = await deps.createTweet({
          authorId: authContext(req).user.id,
          content,
          parentTweetId,
          ...(image === undefined ? {} : { image }),
        });
        const body: CreateTweetResponse = {
          tweet: toTweet(card, deps.mediaOrigin),
        };
        return reply.code(201).header("cache-control", "no-store").send(body);
      } catch (e: unknown) {
        mapError(e);
      }
    },
  );
}
