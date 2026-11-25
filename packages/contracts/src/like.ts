import { z } from "zod";

/**
 * Canonical like/unlike result (US-C02).
 *
 * `liked` is the session member's state for the tweet after the command
 * commits. `likeCount` is that tweet's like count from committed rows, so a
 * client can reconcile an optimistic button without inventing a count
 * (requirements rule 8). The names match `Tweet.likedByViewer` and
 * `Tweet.likeCount`.
 */
export const likeStateSchema = z.strictObject({
  likeCount: z.number().int().nonnegative(),
  liked: z.boolean(),
});

/** Like state returned by the like and unlike commands. */
export type LikeState = z.infer<typeof likeStateSchema>;

/**
 * `PUT` and `DELETE /v1/tweets/:id/like` body.
 *
 * Both commands answer `200` with this document, including a repeat of the
 * same command. Unlike is not `204` because the client needs the count.
 */
export const likeResponseSchema = z.strictObject({
  like: likeStateSchema,
});

/** Parsed like or unlike response. */
export type LikeResponse = z.infer<typeof likeResponseSchema>;
