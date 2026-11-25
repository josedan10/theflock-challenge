import { profilePostsQuerySchema } from "@twitter-clone/contracts";

import { AppError } from "../../../platform/http/errors.js";
import { InvalidKeysetCursorError } from "../../../platform/pagination/signed-keyset-cursor.js";
import { type AuthGuard, viewerId } from "../../auth/http/authentication.js";

import { mapProfileError } from "./profile-error.js";
import {
  DEFAULT_PROFILE_READ_RATE_LIMIT,
  type ProfileRateLimit,
  profileRateLimitConfig,
} from "./rate-limit.js";

import type { ListProfilePosts } from "../application/list-profile-posts.js";
import type { FastifyInstance } from "fastify";

export interface ProfilePostsRouteDependencies {
  listProfilePosts: ListProfilePosts;
  optionalSession: AuthGuard;
  readRateLimit?: ProfileRateLimit;
}

/**
 * `GET /users/:username/tweets` (PROFILE-03, US-A03, AC-A03.4). Mounted under
 * `/v1`.
 *
 * The list is public. A session is optional and only sets `likedByViewer`, so
 * the body is `no-store`. A missing, expired, or revoked session is signed
 * out, never `401`. Unknown, malformed, and soft-deleted usernames are `404`.
 * A bad query or a cursor from another profile is `400` (ASVS 5.0.0 V2.2.1).
 */
export async function profilePostsRoute(
  app: FastifyInstance,
  dependencies: ProfilePostsRouteDependencies,
): Promise<void> {
  app.get<{ Params: { username: string } }>(
    "/users/:username/tweets",
    {
      config: {
        rateLimit: profileRateLimitConfig(
          dependencies.readRateLimit ?? DEFAULT_PROFILE_READ_RATE_LIMIT,
        ),
      },
      preHandler: dependencies.optionalSession,
    },
    async (request, reply) => {
      void reply.header("cache-control", "no-store");
      const query = profilePostsQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw new AppError("MALFORMED_REQUEST", "Invalid profile posts query.");
      }
      try {
        return reply.send(
          await dependencies.listProfilePosts({
            limit: query.data.limit,
            username: request.params.username,
            viewerId: viewerId(request),
            ...(query.data.cursor === undefined
              ? {}
              : { cursor: query.data.cursor }),
          }),
        );
      } catch (error: unknown) {
        if (error instanceof InvalidKeysetCursorError) {
          throw new AppError(
            "MALFORMED_REQUEST",
            "Invalid profile posts cursor.",
          );
        }
        mapProfileError(error);
      }
    },
  );
}
