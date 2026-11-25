import { readFile } from "node:fs/promises";

import { ActivityApiError, logIn, postTweet } from "./api-client.js";
import { planAction, type Random } from "./plan.js";
import { readWorld } from "./store.js";

import type { ApiSession } from "./api-client.js";
import type { Sql } from "postgres";

/** The corpus pictures are simple drawn scenes; a neutral description is accurate for all of them. */
export const CORPUS_IMAGE_ALT = "Simple illustrated outdoor scene.";

export interface SimulatorDependencies {
  apiOrigin: string;
  password: string;
  random: Random;
  sql: Sql;
  log: (line: string) => void;
  /** Remembers a created tweet so reset can remove exactly what was simulated. */
  record: (tweetId: string) => Promise<void>;
}

export type ActivityOutcome =
  | { kind: "idle" }
  | { kind: "post" | "reply"; tweetId: string; username: string };

/**
 * One simulated action. Sessions are reused per account, so steady running
 * logs each account in once; a rejected session is dropped and retried on a
 * later action.
 */
export function createSimulator(dependencies: SimulatorDependencies) {
  const sessions = new Map<string, ApiSession>();

  async function sessionFor(username: string): Promise<ApiSession> {
    const existing = sessions.get(username);
    if (existing !== undefined) {
      return existing;
    }
    const session = await logIn(
      dependencies.apiOrigin,
      `${username}@example.test`,
      dependencies.password,
    );
    sessions.set(username, session);
    return session;
  }

  return async function act(): Promise<ActivityOutcome> {
    const action = planAction(
      await readWorld(dependencies.sql),
      dependencies.random,
    );
    if (action === null) {
      dependencies.log("No seeded demo accounts. Run pnpm db:seed first.");
      return { kind: "idle" };
    }
    const username = action.author.username;
    const image =
      action.image === null
        ? null
        : {
            alt: CORPUS_IMAGE_ALT,
            bytes: await readFile(
              new URL(
                `../activity-corpus/images/${action.image}`,
                import.meta.url,
              ),
            ),
          };
    try {
      const tweetId = await postTweet(
        dependencies.apiOrigin,
        await sessionFor(username),
        {
          content: action.content,
          image,
          parentTweetId: action.parentTweetId,
        },
      );
      await dependencies.record(tweetId);
      const kind = action.parentTweetId === null ? "post" : "reply";
      dependencies.log(`${username} added a ${kind}.`);
      return { kind, tweetId, username };
    } catch (error) {
      if (error instanceof ActivityApiError && error.status === 401) {
        sessions.delete(username);
      }
      throw error;
    }
  };
}
