/** Whether a resolved target may be followed or unfollowed by this member. */
export type FollowTargetDecision = "missing" | "ok" | "self";

/**
 * Decides if `followerId` may form an edge to `targetId`.
 *
 * A missing or soft-deleted target is `missing`. The member themselves is
 * `self`, which the follow table also rejects with a check constraint
 * (AC-C01.2). Any other visible member is `ok`.
 */
export function decideFollowTarget(
  followerId: string,
  targetId: string | null,
): FollowTargetDecision {
  if (targetId === null) {
    return "missing";
  }
  if (targetId === followerId) {
    return "self";
  }
  return "ok";
}
