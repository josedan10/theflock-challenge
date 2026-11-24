import { ProfileNotFoundError } from "../domain/errors.js";

import type {
  ProfileRepository,
  ProfileUpdate,
  PublicProfile,
} from "./ports.js";

export interface UpdateOwnProfileInput {
  /** Member id taken from the authenticated session, never from the body. */
  userId: string;
  patch: ProfileUpdate;
}

export interface UpdateOwnProfileDependencies {
  profiles: ProfileRepository;
  clock: () => Date;
}

export type UpdateOwnProfile = (
  input: UpdateOwnProfileInput,
) => Promise<PublicProfile>;

/**
 * Updates the authenticated member's own profile (PROFILE-02).
 *
 * There is no target username argument, so the operation cannot be aimed at
 * another member. The session adapter is responsible for supplying `userId`.
 *
 * @throws {ProfileNotFoundError} When the member does not exist or is soft-deleted.
 * @throws {Error} When the patch includes neither display name nor bio. The HTTP
 * boundary rejects that shape first; this guards other callers.
 */
export function createUpdateOwnProfile(
  dependencies: UpdateOwnProfileDependencies,
): UpdateOwnProfile {
  return async (input) => {
    if (
      input.patch.displayName === undefined &&
      input.patch.bio === undefined
    ) {
      throw new Error("Profile update requires a display name or bio");
    }
    const updated = await dependencies.profiles.update(
      input.userId,
      input.patch,
      dependencies.clock(),
    );
    if (updated === null) {
      throw new ProfileNotFoundError();
    }
    return updated;
  };
}
