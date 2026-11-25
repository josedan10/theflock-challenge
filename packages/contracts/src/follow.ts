import { z } from "zod";

/**
 * Canonical follow/unfollow result (US-C01).
 *
 * `following` is the session member's relationship to the target after the
 * command commits. `followerCount` is that target's follower count from
 * committed rows, so a client can reconcile an optimistic button without
 * inventing a count (requirements rule 8).
 */
export const followRelationshipSchema = z.strictObject({
  followerCount: z.number().int().nonnegative(),
  following: z.boolean(),
});

/** Follow relationship returned by the follow and unfollow commands. */
export type FollowRelationship = z.infer<typeof followRelationshipSchema>;

/**
 * `PUT` and `DELETE /v1/users/:username/follow` body.
 *
 * Both commands answer `200` with this document, including a repeat of the
 * same command. Unfollow is not `204` because the client needs the count.
 */
export const followResponseSchema = z.strictObject({
  relationship: followRelationshipSchema,
});

/** Parsed follow or unfollow response. */
export type FollowResponse = z.infer<typeof followResponseSchema>;
