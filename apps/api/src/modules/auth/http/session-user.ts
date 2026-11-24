import type { StoredUser } from "../application/ports.js";
import type { SessionUser } from "@twitter-clone/contracts";


/**
 * Projects a stored member onto the session-safe contract: email, password
 * hash, and session material never leave the API.
 */
export function toSessionUser(user: StoredUser): SessionUser {
  return {
    // Avatar uploads are a bonus feature; until then clients render a placeholder.
    avatarUrl: null,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
    displayName: user.displayName,
    id: user.id,
    username: user.username,
  };
}
