import { createSignedKeysetCursor } from "../../platform/pagination/signed-keyset-cursor.js";

import { createGetPublicProfile } from "./application/get-public-profile.js";
import { createListProfilePosts } from "./application/list-profile-posts.js";
import { createSearchUsers } from "./application/search-users.js";
import { createUpdateOwnProfile } from "./application/update-own-profile.js";
import { getProfileRoute } from "./http/get-profile-route.js";
import { profilePostsRoute } from "./http/profile-posts-route.js";
import { type ProfileRateLimit } from "./http/rate-limit.js";
import { searchUsersRoute } from "./http/search-users-route.js";
import { updateProfileRoute } from "./http/update-profile-route.js";
import { createDrizzleProfilePostsReader } from "./infrastructure/drizzle-profile-posts.js";
import { createDrizzleProfileRepository } from "./infrastructure/drizzle-profile-repository.js";
import { createDrizzleUserSearcher } from "./infrastructure/drizzle-user-search.js";

import type { Database } from "../../platform/database/client.js";
import type { AuthGuard } from "../auth/http/authentication.js";
import type { FastifyInstance } from "fastify";

export interface UsersModuleOptions {
  db: Database;
  requireSession: AuthGuard;
  requireCsrf: AuthGuard;
  optionalSession: AuthGuard;
  sessionSecret: string;
  /** Origin used to build attached-image URLs. No trailing slash. */
  mediaOrigin: string;
  /** Injected for deterministic tests; defaults to the system clock. */
  clock?: () => Date;
  readRateLimit?: ProfileRateLimit;
  writeRateLimit?: ProfileRateLimit;
  searchRateLimit?: ProfileRateLimit;
}

/** Composition root for public profiles, own-profile edits and people search. */
export function usersModule(options: UsersModuleOptions) {
  const profiles = createDrizzleProfileRepository(options.db);
  const getPublicProfile = createGetPublicProfile(profiles);
  const updateOwnProfile = createUpdateOwnProfile({
    clock: options.clock ?? (() => new Date()),
    profiles,
  });

  const searchUsers = createSearchUsers(createDrizzleUserSearcher(options.db));
  const listProfilePosts = createListProfilePosts({
    cursors: createSignedKeysetCursor(
      options.sessionSecret,
      "profile-posts/cursor-key",
    ),
    reader: createDrizzleProfilePostsReader(options.db, options.mediaOrigin),
  });

  return async (app: FastifyInstance): Promise<void> => {
    await searchUsersRoute(app, {
      requireSession: options.requireSession,
      searchUsers,
      ...(options.searchRateLimit === undefined
        ? {}
        : { searchRateLimit: options.searchRateLimit }),
    });
    await getProfileRoute(app, {
      getPublicProfile,
      ...(options.readRateLimit === undefined
        ? {}
        : { readRateLimit: options.readRateLimit }),
    });
    await profilePostsRoute(app, {
      listProfilePosts,
      optionalSession: options.optionalSession,
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
