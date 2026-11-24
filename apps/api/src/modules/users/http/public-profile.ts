import type { PublicProfile } from "../application/ports.js";
import type { PublicProfile as PublicProfileDocument } from "@twitter-clone/contracts";

/**
 * Maps a stored public profile onto the wire contract.
 *
 * `avatarUrl` stays `null` until an upload flow exists; clients render a
 * placeholder. Bio is copied unchanged so the response stays plain text.
 */
export function toPublicProfile(profile: PublicProfile): PublicProfileDocument {
  return {
    avatarUrl: null,
    bio: profile.bio,
    createdAt: profile.createdAt.toISOString(),
    displayName: profile.displayName,
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
    id: profile.id,
    tweetCount: profile.tweetCount,
    username: profile.username,
  };
}
