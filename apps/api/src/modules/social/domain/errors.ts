/**
 * Raised when the follow target does not exist, cannot exist, or is
 * soft-deleted. The HTTP layer answers every case with the same `404`
 * (AC-C01.1).
 */
export class FollowTargetNotFoundError extends Error {
  override readonly name = "FollowTargetNotFoundError";

  constructor() {
    super("That profile does not exist.");
  }
}

/**
 * Raised when a member names themselves as the follow target. The HTTP layer
 * answers `422` (AC-C01.2). The database check repeats this rule.
 */
export class SelfFollowError extends Error {
  override readonly name = "SelfFollowError";

  constructor() {
    super("You cannot follow yourself.");
  }
}
