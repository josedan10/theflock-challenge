import { LOOPBACK_HOSTS } from "../local-target.js";

/** Compose service names the simulator may reach from inside the dev network. */
export const COMPOSE_API_HOST = "api";
export const COMPOSE_DATABASE_HOST = "postgres";

/**
 * Seconds between actions: each gap is random between the configured minimum
 * and maximum. The floor keeps logins under the API's 5/minute budget.
 */
export const ACTIVITY_INTERVAL_SECONDS = {
  defaultMax: 40,
  defaultMin: 15,
  floor: 15,
  ceiling: 3600,
} as const;

/** A setting the simulator refuses. The message names the setting and is safe to print. */
export class ActivitySettingsError extends Error {
  override name = "ActivitySettingsError";
}

export interface ActivityConfig {
  apiOrigin: string;
  /** Shortest and longest gap between two actions. */
  minIntervalMs: number;
  maxIntervalMs: number;
}

function seconds(name: string, raw: string): number {
  const { ceiling, floor } = ACTIVITY_INTERVAL_SECONDS;
  const value = /^[1-9][0-9]{0,3}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(value >= floor) || value > ceiling) {
    throw new ActivitySettingsError(
      `${name} must be an integer from ${floor} to ${ceiling}.`,
    );
  }
  return value;
}

/** A random gap between the configured minimum and maximum. */
export function nextIntervalMs(
  config: Pick<ActivityConfig, "maxIntervalMs" | "minIntervalMs">,
  random: () => number,
): number {
  const span = config.maxIntervalMs - config.minIntervalMs;
  return config.minIntervalMs + Math.round(random() * span);
}

/**
 * Reads the simulator's feature flag and limits. Returns null when the flag
 * is off, which is the default.
 *
 * @throws {ActivitySettingsError} When the flag is on with an unsafe or malformed setting.
 */
export function activityConfig(env: NodeJS.ProcessEnv): ActivityConfig | null {
  const flag = env.ACTIVITY_SIMULATOR ?? "false";
  if (flag !== "true" && flag !== "false") {
    throw new ActivitySettingsError(
      "ACTIVITY_SIMULATOR must be true or false.",
    );
  }
  if (flag === "false") {
    return null;
  }
  if ((env.NODE_ENV ?? "development") !== "development") {
    throw new ActivitySettingsError(
      "The activity simulator only runs in development.",
    );
  }
  const min = seconds(
    "ACTIVITY_MIN_INTERVAL_SECONDS",
    env.ACTIVITY_MIN_INTERVAL_SECONDS ??
      String(ACTIVITY_INTERVAL_SECONDS.defaultMin),
  );
  const max = seconds(
    "ACTIVITY_MAX_INTERVAL_SECONDS",
    env.ACTIVITY_MAX_INTERVAL_SECONDS ??
      String(ACTIVITY_INTERVAL_SECONDS.defaultMax),
  );
  if (min > max) {
    throw new ActivitySettingsError(
      "ACTIVITY_MIN_INTERVAL_SECONDS must not be greater than ACTIVITY_MAX_INTERVAL_SECONDS.",
    );
  }
  const api = URL.parse(env.ACTIVITY_API_URL ?? "http://localhost:4000");
  if (
    !api ||
    api.protocol !== "http:" ||
    ![...LOOPBACK_HOSTS, COMPOSE_API_HOST].includes(api.hostname) ||
    api.pathname !== "/" ||
    api.search !== "" ||
    api.hash !== "" ||
    api.username !== "" ||
    api.password !== ""
  ) {
    throw new ActivitySettingsError(
      "ACTIVITY_API_URL must be a local http origin, such as http://localhost:4000.",
    );
  }
  return {
    apiOrigin: api.origin,
    maxIntervalMs: max * 1000,
    minIntervalMs: min * 1000,
  };
}
