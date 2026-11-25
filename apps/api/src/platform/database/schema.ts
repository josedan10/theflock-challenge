// Aggregates module tables for drizzle-kit and typed clients. Each feature adds
// its tables through forward-only migrations with its vertical slice.
export * from "../../modules/auth/infrastructure/auth.schema.js";
export * from "../../modules/tweets/infrastructure/tweets.schema.js";
export * from "../../modules/social/infrastructure/social.schema.js";
export * from "../../modules/notifications/infrastructure/notifications.schema.js";
