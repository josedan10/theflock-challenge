import { z } from "zod";

/** Stable machine-readable error codes; clients branch on these, never on messages. */
export const errorCodeSchema = z.enum([
  "MALFORMED_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

/** Machine-readable error code shared by the API and web client. */
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * HTTP status for each error code, matching the API status semantics.
 * Keeping the mapping here prevents the API and client from drifting.
 */
export const errorStatusByCode = {
  MALFORMED_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ErrorCode, number>;

/**
 * Error envelope returned by every failing API response.
 *
 * `message` and `fields` must be safe to show to the requester: they never
 * reveal whether an unrelated account exists, internal identifiers, stack
 * traces, or database details.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    fields: z.record(z.string(), z.array(z.string().min(1)).min(1)).optional(),
    requestId: z.string().min(1),
  }),
});

/** Parsed API error envelope. */
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
