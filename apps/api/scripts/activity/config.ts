import { LOOPBACK_HOSTS } from "../local-target.js";

/** Compose service names the simulator may reach from inside the dev network. */
export const COMPOSE_API_HOST = "api";
export const COMPOSE_DATABASE_HOST = "postgres";

/** Seconds between actions. The floor keeps logins under the API's 5/minute budget. */
export const ACTIVITY_INTERVAL_SECONDS = {
  default: 30,
  max: 3600,
  min: 15,
} as const;

export interface ActivityConfig {
  apiOrigin: string;
  intervalMs: number;
}

/**
 * Reads the simulator's feature flag and limits. Returns null when the flag
 * is off, which is the default.
 *
 * @throws {Error} When the flag is on with an unsafe or malformed setting.
 */
export function activityConfig(env: NodeJS.ProcessEnv): ActivityConfig | null {
  const flag = env.ACTIVITY_SIMULATOR ?? "false";
  if (flag !== "true" && flag !== "false") {
    throw new Error("ACTIVITY_SIMULATOR must be true or false.");
  }
  if (flag === "false") {
    return null;
  }
  if ((env.NODE_ENV ?? "development") !== "development") {
    throw new Error("The activity simulator only runs in development.");
  }
  const rawInterval =
    env.ACTIVITY_INTERVAL_SECONDS ?? String(ACTIVITY_INTERVAL_SECONDS.default);
  const seconds = /^[1-9][0-9]{0,3}$/.test(rawInterval)
    ? Number(rawInterval)
    : Number.NaN;
  if (
    !(seconds >= ACTIVITY_INTERVAL_SECONDS.min) ||
    seconds > ACTIVITY_INTERVAL_SECONDS.max
  ) {
    throw new Error(
      `ACTIVITY_INTERVAL_SECONDS must be an integer from ${ACTIVITY_INTERVAL_SECONDS.min} to ${ACTIVITY_INTERVAL_SECONDS.max}.`,
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
    throw new Error(
      "ACTIVITY_API_URL must be a local http origin, such as http://localhost:4000.",
    );
  }
  return { apiOrigin: api.origin, intervalMs: seconds * 1000 };
}
