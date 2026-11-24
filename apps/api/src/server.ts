import postgres from "postgres";

import { buildApp } from "./app.js";
import { parseEnvironment } from "./platform/config/environment.js";
import { createDatabase } from "./platform/database/client.js";

const environment = parseEnvironment(process.env);
const sql = postgres(environment.DATABASE_URL, { max: 10 });
const app = await buildApp({
  auth: {
    db: createDatabase(sql),
    rateLimit: {
      max: environment.AUTH_RATE_LIMIT_PER_MINUTE,
      timeWindowMs: 60_000,
    },
    sessionCookie: {
      domain: environment.COOKIE_DOMAIN,
      secure: environment.COOKIE_SECURE,
      ttlSeconds: environment.SESSION_TTL_SECONDS,
    },
    sessionSecret: environment.SESSION_SECRET,
  },
  corsOrigin: environment.CORS_ORIGIN,
  tweetWriteRateLimit: {
    max: environment.TWEET_RATE_LIMIT_PER_MINUTE,
    timeWindowMs: 60_000,
  },
  logger: environment.NODE_ENV !== "test",
  ...(environment.TRUST_PROXY === undefined
    ? {}
    : { trustProxy: environment.TRUST_PROXY }),
  readinessCheck: async () => {
    try {
      await sql`select 1`;
      return true;
    } catch {
      return false;
    }
  },
});

app.addHook("onClose", async () => sql.end({ timeout: 5 }));

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, "shutting down API");
  await app.close();
  process.exitCode = 0;
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error: unknown) {
  app.log.fatal({ err: error }, "API startup failed");
  process.exitCode = 1;
}
