import { createGetPublicProfile } from "./application/get-public-profile.js";
import { createUpdateOwnProfile } from "./application/update-own-profile.js";
import { getProfileRoute } from "./http/get-profile-route.js";
import { type ProfileRateLimit } from "./http/rate-limit.js";
import { updateProfileRoute } from "./http/update-profile-route.js";
import { createDrizzleProfileRepository } from "./infrastructure/drizzle-profile-repository.js";

import type { Database } from "../../platform/database/client.js";
import type { AuthGuard } from "../auth/http/authentication.js";
import type { FastifyInstance } from "fastify";

export interface UsersModuleOptions {
  db: Database;
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  /** Injected for deterministic tests; defaults to the system clock. */
  clock?: () => Date;
  readRateLimit?: ProfileRateLimit;
  writeRateLimit?: ProfileRateLimit;
}

/** Composition root for public profiles and own-profile edits. */
export function usersModule(options: UsersModuleOptions) {
  const profiles = createDrizzleProfileRepository(options.db);
  const getPublicProfile = createGetPublicProfile(profiles);
  const updateOwnProfile = createUpdateOwnProfile({
    clock: options.clock ?? (() => new Date()),
    profiles,
  });

  return async (app: FastifyInstance): Promise<void> => {
    await getProfileRoute(app, {
      getPublicProfile,
      ...(options.readRateLimit === undefined
        ? {}
        : { readRateLimit: options.readRateLimit }),
    });
    await updateProfileRoute(app, {
      requireCsrf: options.requireCsrf,
      requireSession: options.requireSession,
      updateOwnProfile,
      ...(options.writeRateLimit === undefined
        ? {}
        : { writeRateLimit: options.writeRateLimit }),
    });
  };
}
