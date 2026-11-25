import { userSearchQuerySchema } from "@twitter-clone/contracts";

import { authContext, type AuthGuard } from "../../auth/http/authentication.js";
import { parseBody } from "../../auth/http/validation.js";

import {
  DEFAULT_USER_SEARCH_RATE_LIMIT,
  type ProfileRateLimit,
  profileRateLimitConfig,
} from "./rate-limit.js";

import type { SearchUsers } from "../application/search-users.js";
import type { FastifyInstance } from "fastify";

export interface SearchUsersRouteDependencies {
  requireSession: AuthGuard;
  searchUsers: SearchUsers;
  searchRateLimit?: ProfileRateLimit;
}

/**
 * `GET /users/search?q=&limit=` (US-D01). Mounted under `/v1`.
 *
 * Members only. Fastify prefers this static path over `/users/:username`.
 * An invalid query, including text shorter than two characters, is
 * `422 VALIDATION_ERROR` with `fields.q` (AC-D01.4). The search text is user
 * input and stays out of logs.
 */
export async function searchUsersRoute(
  app: FastifyInstance,
  dependencies: SearchUsersRouteDependencies,
): Promise<void> {
  app.get(
    "/users/search",
    {
      config: {
        rateLimit: profileRateLimitConfig(
          dependencies.searchRateLimit ?? DEFAULT_USER_SEARCH_RATE_LIMIT,
        ),
      },
      preHandler: dependencies.requireSession,
    },
    async (request, reply) => {
      const query = parseBody(userSearchQuerySchema, request.query);
      const result = await dependencies.searchUsers({
        limit: query.limit,
        text: query.q,
        viewerId: authContext(request).user.id,
      });
      return reply.header("cache-control", "no-store").send(result);
    },
  );
}
