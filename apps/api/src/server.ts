import postgres from "postgres";

import { buildApp } from "./app.js";
import { parseEnvironment } from "./platform/config/environment.js";

const environment = parseEnvironment(process.env);
const sql = postgres(environment.DATABASE_URL, { max: 10 });
const app = await buildApp({
  corsOrigin: environment.CORS_ORIGIN,
  logger: environment.NODE_ENV !== "test",
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
