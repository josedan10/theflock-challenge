import { mapProfileError } from "./profile-error.js";
import { toPublicProfile } from "./public-profile.js";
import {
  DEFAULT_PROFILE_READ_RATE_LIMIT,
  type ProfileRateLimit,
  profileRateLimitConfig,
} from "./rate-limit.js";

import type { GetPublicProfile } from "../application/get-public-profile.js";
import type { FastifyInstance } from "fastify";

export interface GetProfileRouteDependencies {
  getPublicProfile: GetPublicProfile;
  readRateLimit?: ProfileRateLimit;
}

/**
 * `GET /users/:username` (US-A03). Mounted under `/v1`.
 *
 * Authentication is optional: v1 profiles are public. A session cookie is
 * ignored, including a stale one. Static routes such as `/users/search` stay
 * available because Fastify prefers them over this parameter.
 */
export async function getProfileRoute(
  app: FastifyInstance,
  dependencies: GetProfileRouteDependencies,
): Promise<void> {
  app.get<{ Params: { username: string } }>(
    "/users/:username",
    {
      config: {
        rateLimit: profileRateLimitConfig(
          dependencies.readRateLimit ?? DEFAULT_PROFILE_READ_RATE_LIMIT,
        ),
      },
    },
    async (request, reply) => {
      try {
        const profile = await dependencies.getPublicProfile(
          request.params.username,
        );
        return reply
          .header("cache-control", "no-store")
          .send({ profile: toPublicProfile(profile) });
      } catch (error: unknown) {
        mapProfileError(error);
      }
    },
  );
}
