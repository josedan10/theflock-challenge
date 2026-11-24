import { ProfileNotFoundError } from "../domain/errors.js";
import { canonicalPublicUsername } from "../domain/username.js";

import type { ProfileRepository, PublicProfile } from "./ports.js";

export type GetPublicProfile = (username: string) => Promise<PublicProfile>;

/**
 * Resolves a public profile by username (US-A03).
 *
 * v1 profiles are public, so this use case does not take a viewer. It still
 * hides soft-deleted members by treating them as absent.
 *
 * @throws {ProfileNotFoundError} When the username cannot exist, names no
 * member, or names a soft-deleted member.
 */
export function createGetPublicProfile(
  profiles: ProfileRepository,
): GetPublicProfile {
  return async (username) => {
    const canonical = canonicalPublicUsername(username);
    if (canonical === null) {
      throw new ProfileNotFoundError();
    }
    const profile = await profiles.findByUsername(canonical);
    if (profile === null) {
      throw new ProfileNotFoundError();
    }
    return profile;
  };
}
