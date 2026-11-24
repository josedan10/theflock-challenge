import type { RateLimitOptions } from "@fastify/rate-limit";

/** Per-client attempt budget for an auth route (API doc: 5/minute to start). */
export interface AuthRateLimit {
  max: number;
  timeWindowMs: number;
}

export const DEFAULT_AUTH_RATE_LIMIT: AuthRateLimit = {
  max: 5,
  timeWindowMs: 60_000,
};

/**
 * Route-level `config.rateLimit`. It runs in onRequest, before validation or
 * any lookup, so every attempt costs the same whether or not an account
 * exists. `request.ip` honours Fastify's `trustProxy`, never a raw header.
 */
export function authRateLimitConfig(
  limit: AuthRateLimit = DEFAULT_AUTH_RATE_LIMIT,
): RateLimitOptions {
  return {
    keyGenerator: (request) => request.ip,
    max: limit.max,
    timeWindow: limit.timeWindowMs,
  };
}
