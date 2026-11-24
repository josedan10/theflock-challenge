import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

if (process.env.DATABASE_URL === undefined) {
  try {
    process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
  } catch (error: unknown) {
    throw new Error("Unable to load the root .env file for database commands", {
      cause: error,
    });
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required to run database commands");
}

export default defineConfig({
  dbCredentials: { url: databaseUrl },
  dialect: "postgresql",
  migrations: { prefix: "timestamp" },
  out: "./drizzle",
  schema: "./src/platform/database/schema.ts",
  strict: true,
  verbose: true,
});
