import { z } from "zod";

import { codePointLength } from "./auth";
import { followListItemSchema } from "./follow-list";
import { TIMELINE_DEFAULT_LIMIT, TIMELINE_MAX_LIMIT } from "./timeline";

export const USER_SEARCH_MIN_LENGTH = 2;
export const USER_SEARCH_MAX_LENGTH = 50;
export const USER_SEARCH_DEFAULT_LIMIT = TIMELINE_DEFAULT_LIMIT;
export const USER_SEARCH_MAX_LIMIT = TIMELINE_MAX_LIMIT;

/**
 * People-search text (US-D01). Trimmed, then 2–50 characters counted as code
 * points. It is matched literally: `%`, `_` and `\` are data, never patterns
 * (AC-D01.4). Clients apply the same rule before sending (AC-D01.4).
 */
export const userSearchTextSchema = z
  .string()
  .trim()
  .refine((value) => !value.includes("\u0000"), {
    message: "Must not contain a null character.",
  })
  .refine((value) => codePointLength(value) >= USER_SEARCH_MIN_LENGTH, {
    message: `Enter at least ${USER_SEARCH_MIN_LENGTH} characters.`,
  })
  .refine((value) => codePointLength(value) <= USER_SEARCH_MAX_LENGTH, {
    message: `Use at most ${USER_SEARCH_MAX_LENGTH} characters.`,
  });

/** `GET /v1/users/search` query: `q` required, `limit` optional and capped. */
export const userSearchQuerySchema = z.strictObject({
  limit: z
    .string()
    .regex(/^[1-9][0-9]*$/, { message: "Must be a positive whole number." })
    .transform((value) => Math.min(Number(value), USER_SEARCH_MAX_LIMIT))
    .default(USER_SEARCH_DEFAULT_LIMIT),
  q: userSearchTextSchema,
});

/** Parsed people-search query. */
export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>;

/**
 * Best matches first, at most `limit` of them (AC-D01.2, AC-D01.3). Each
 * result carries the viewer's relationship, like a follow-list row, and only
 * public fields: never email or credentials.
 */
export const userSearchResponseSchema = z.strictObject({
  items: z.array(followListItemSchema).max(USER_SEARCH_MAX_LIMIT),
});

/** Parsed people-search response. */
export type UserSearchResponse = z.infer<typeof userSearchResponseSchema>;
