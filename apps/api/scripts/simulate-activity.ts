import { readFile } from "node:fs/promises";

import postgres from "postgres";

import { ActivityApiError } from "./activity/api-client.js";
import {
  activityConfig,
  ActivitySettingsError,
  COMPOSE_DATABASE_HOST,
} from "./activity/config.js";
import { createLedger } from "./activity/ledger.js";
import { createSimulator } from "./activity/simulator.js";
import { resetActivity } from "./activity/store.js";
import { localTarget } from "./local-target.js";

const passwordFile = new URL("../../../.env.seed-password", import.meta.url);
/** Git-ignored, and shared with the Compose service through the workspace mount. */
const ledger = createLedger(
  new URL("../../../.data/activity-posts.txt", import.meta.url),
);
const usage = "Usage: pnpm activity [--once | --reset]";

function describe(error: unknown): string {
  if (
    error instanceof ActivityApiError ||
    error instanceof ActivitySettingsError
  ) {
    return error.message;
  }
  // Database and network errors can carry connection details; keep the class only.
  return error instanceof Error ? `${error.name}.` : "Unknown error.";
}

function localDatabase() {
  try {
    return localTarget(process.env.DATABASE_URL, process.env.NODE_ENV, [
      COMPOSE_DATABASE_HOST,
    ]);
  } catch {
    throw new ActivitySettingsError(
      "DATABASE_URL must point at the local development database.",
    );
  }
}

async function run(mode: "loop" | "once" | "reset") {
  const config = activityConfig(process.env);
  if (config === null && mode !== "reset") {
    console.log(
      "Activity simulator is off. Set ACTIVITY_SIMULATOR=true to start it.",
    );
    return;
  }
  const sql = postgres(localDatabase());
  try {
    if (mode === "reset") {
      const removed = await resetActivity(sql, await ledger.read());
      await ledger.clear();
      console.log(
        `Removed ${removed.tweets} simulated posts and replies, and ${removed.likes} likes.`,
      );
      return;
    }
    if (config === null) {
      return;
    }
    const password = (await readFile(passwordFile, "utf8")).trim();
    const act = createSimulator({
      apiOrigin: config.apiOrigin,
      log: (line) => console.log(line),
      password,
      random: Math.random,
      record: ledger.record,
      sql,
    });
    if (mode === "once") {
      await act();
      return;
    }
    console.log(
      `Activity simulator on: one action every ${config.intervalMs / 1000}s. Ctrl+C stops it.`,
    );
    await new Promise<void>((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      let current: Promise<void> = Promise.resolve();
      let stopping = false;
      const stop = () => {
        stopping = true;
        clearTimeout(timer);
        // Let an action in progress finish and record its tweet before closing.
        void current.then(resolve);
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      const tick = async () => {
        try {
          await act();
        } catch (error) {
          console.error(`Activity skipped: ${describe(error)}`);
        }
        // Schedule after the action finishes so slow actions never overlap.
        if (!stopping) {
          timer = setTimeout(() => {
            current = tick();
          }, config.intervalMs);
        }
      };
      current = tick();
    });
    console.log("Activity simulator stopped.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const [flag, ...rest] = process.argv.slice(2);
const mode =
  flag === undefined
    ? "loop"
    : flag === "--once"
      ? "once"
      : flag === "--reset"
        ? "reset"
        : null;
if (mode === null || rest.length > 0) {
  console.error(usage);
  process.exitCode = 1;
} else {
  run(mode).catch((error: unknown) => {
    console.error(
      `Activity simulator failed: ${describe(error)} Check the flag, the local database and API, and .env.seed-password.`,
    );
    process.exitCode = 1;
  });
}
