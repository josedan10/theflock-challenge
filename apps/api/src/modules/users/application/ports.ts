/**
 * Public profile read model. Email, password hashes, and storage keys stay in
 * the member row and are not loaded for this view.
 */
export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  tweetCount: number;
  followerCount: number;
  followingCount: number;
  createdAt: Date;
}

/**
 * Fields a member may change on their own profile. Absent fields stay as stored.
 * There is no target username: the caller may only name a member id it already
 * authorized.
 */
export interface ProfileUpdate {
  displayName?: string;
  bio?: string;
}

export interface ProfileRepository {
  /** Returns `null` for an unknown or soft-deleted username. */
  findByUsername(username: string): Promise<PublicProfile | null>;
  /**
   * Applies the given fields to one member.
   *
   * @returns The profile after commit, or `null` when that member does not
   * exist or is soft-deleted. A concurrent update of the other field is kept:
   * each call writes only the fields it was given.
   */
  update(
    userId: string,
    patch: ProfileUpdate,
    now: Date,
  ): Promise<PublicProfile | null>;
}

/** One member found by people search, with the viewer's relationship. */
export interface UserSearchEntry {
  id: string;
  username: string;
  displayName: string;
  followedByViewer: boolean;
}

export interface UserSearcher {
  /**
   * Visible members whose username or display name contains `text`,
   * case-insensitively and literally, best matches first.
   *
   * @param text Already trimmed and lowercased; wildcards are still literal.
   */
  search(input: {
    text: string;
    viewerId: string;
    limit: number;
  }): Promise<UserSearchEntry[]>;
}
