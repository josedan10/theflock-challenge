/**
 * Raised when a profile lookup or own-profile update names no visible member.
 *
 * Unknown usernames, usernames that cannot exist, and soft-deleted members all
 * use this one error so the HTTP layer can answer them identically (AC-A03.2).
 */
export class ProfileNotFoundError extends Error {
  override readonly name = "ProfileNotFoundError";

  constructor() {
    super("That profile does not exist.");
  }
}
