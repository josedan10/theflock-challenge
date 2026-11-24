import { defineConfig, devices } from "@playwright/test";

const webPort = 3100;
const apiPort = 4100;
const webUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;

// Browser tests need a real, migrated PostgreSQL. CI provides DATABASE_URL;
// locally it comes from the root .env (the Compose database). Each run
// creates throwaway accounts with unique emails.
if (process.env.DATABASE_URL === undefined) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Reported below with an actionable message.
  }
}
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error(
    "Browser tests need DATABASE_URL: start the Compose database (docker compose up -d postgres) and copy .env.example to .env.",
  );
}

export default defineConfig({
  expect: { timeout: 5_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 2 : 0,
  testDir: "./e2e",
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --filter @twitter-clone/api db:migrate && pnpm --filter @twitter-clone/api exec tsx src/server.ts",
      env: {
        API_HOST: "127.0.0.1",
        API_PORT: String(apiPort),
        // Journeys register and log in many times from one address.
        AUTH_RATE_LIMIT_PER_MINUTE: "1000",
        COOKIE_SECURE: "false",
        CORS_ORIGIN: webUrl,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        SESSION_SECRET: "e2e-only-session-secret-not-for-real-use",
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${apiUrl}/health/ready`,
    },
    {
      command: `pnpm --filter @twitter-clone/web dev --hostname 127.0.0.1 --port ${webPort}`,
      env: { NEXT_PUBLIC_API_URL: apiUrl },
      reuseExistingServer: false,
      timeout: 120_000,
      url: webUrl,
    },
  ],
  workers: process.env.CI ? 2 : undefined,
});
