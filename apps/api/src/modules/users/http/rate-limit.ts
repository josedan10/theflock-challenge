import type { RateLimitOptions } from "@fastify/rate-limit";

/** Per-client budget for a profile route. */
export interface ProfileRateLimit {
  max: number;
  timeWindowMs: number;
}

/** API starting point for profile reads. */
export const DEFAULT_PROFILE_READ_RATE_LIMIT: ProfileRateLimit = {
  max: 120,
  timeWindowMs: 60_000,
};

/** API starting point for profile edits. */
export const DEFAULT_PROFILE_WRITE_RATE_LIMIT: ProfileRateLimit = {
  max: 20,
  timeWindowMs: 60_000,
};

/**
 * Route-level limit keyed by `request.ip`, which honours `TRUST_PROXY` and
 * ignores a raw forwarding header. It runs before the handler, so rejected
 * requests spend budget too.
 */
export function profileRateLimitConfig(
  limit: ProfileRateLimit,
): RateLimitOptions {
  return {
    keyGenerator: (request) => request.ip,
    max: limit.max,
    timeWindow: limit.timeWindowMs,
  };
}

/** API starting point for people search: each query is a pattern scan. */
export const DEFAULT_USER_SEARCH_RATE_LIMIT: ProfileRateLimit = {
  max: 60,
  timeWindowMs: 60_000,
};
