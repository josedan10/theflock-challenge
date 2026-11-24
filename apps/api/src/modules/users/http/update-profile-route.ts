import { updateProfileRequestSchema } from "@twitter-clone/contracts";

import { authContext, type AuthGuard } from "../../auth/http/authentication.js";
import { parseBody } from "../../auth/http/validation.js";

import { mapProfileError } from "./profile-error.js";
import { toPublicProfile } from "./public-profile.js";
import {
  DEFAULT_PROFILE_WRITE_RATE_LIMIT,
  type ProfileRateLimit,
  profileRateLimitConfig,
} from "./rate-limit.js";

import type { ProfileUpdate } from "../application/ports.js";
import type { UpdateOwnProfile } from "../application/update-own-profile.js";
import type { FastifyInstance } from "fastify";

export interface UpdateProfileRouteDependencies {
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  updateOwnProfile: UpdateOwnProfile;
  writeRateLimit?: ProfileRateLimit;
}

/**
 * Copies only the fields the contract actually sent.
 *
 * Zod's output marks omitted keys as `string | undefined`, which must not be
 * forwarded under exact optional properties or the repository would treat an
 * omitted field as a write.
 */
function profilePatch(input: {
  bio?: string | undefined;
  displayName?: string | undefined;
}): ProfileUpdate {
  const patch: ProfileUpdate = {};
  if (input.bio !== undefined) {
    patch.bio = input.bio;
  }
  if (input.displayName !== undefined) {
    patch.displayName = input.displayName;
  }
  return patch;
}

/** Field names only. Values are personal data and must not be logged. */
function updatedFieldNames(patch: ProfileUpdate): string[] {
  return [
    ...(patch.bio === undefined ? [] : ["bio"]),
    ...(patch.displayName === undefined ? [] : ["displayName"]),
  ];
}

/**
 * `PATCH /me/profile` (PROFILE-02). Mounted under `/v1`.
 *
 * The member id comes from the session. The body cannot name another member,
 * change identity, or set an avatar key.
 */
export async function updateProfileRoute(
  app: FastifyInstance,
  dependencies: UpdateProfileRouteDependencies,
): Promise<void> {
  app.patch(
    "/me/profile",
    {
      config: {
        rateLimit: profileRateLimitConfig(
          dependencies.writeRateLimit ?? DEFAULT_PROFILE_WRITE_RATE_LIMIT,
        ),
      },
      preHandler: [dependencies.requireSession, dependencies.requireCsrf],
    },
    async (request, reply) => {
      const patch = profilePatch(
        parseBody(updateProfileRequestSchema, request.body),
      );
      const auth = authContext(request);
      try {
        const profile = await dependencies.updateOwnProfile({
          patch,
          userId: auth.user.id,
        });
        request.log.info(
          { updatedFields: updatedFieldNames(patch), userId: auth.user.id },
          "profile updated",
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
