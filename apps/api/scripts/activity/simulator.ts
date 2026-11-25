import { readFile } from "node:fs/promises";

import { ActivityApiError, likeTweet, logIn, postTweet } from "./api-client.js";
import { planAction, type PlannedAction, type Random } from "./plan.js";
import { readWorld } from "./store.js";

import type { ApiSession } from "./api-client.js";
import type { LedgerEntry } from "./ledger.js";
import type { Sql } from "postgres";

/** The corpus pictures are simple drawn scenes; a neutral description is accurate for all of them. */
export const CORPUS_IMAGE_ALT = "Simple illustrated outdoor scene.";

export interface SimulatorDependencies {
  apiOrigin: string;
  password: string;
  random: Random;
  sql: Sql;
  log: (line: string) => void;
  /** Remembers what was done so reset can undo exactly what was simulated. */
  record: (entry: LedgerEntry) => Promise<void>;
}

export type ActivityOutcome =
  | { kind: "idle" }
  | { kind: PlannedAction["kind"]; tweetId: string; username: string };

async function pictureFor(name: string | null) {
  if (name === null) {
    return null;
  }
  const bytes = await readFile(
    new URL(`../activity-corpus/images/${name}`, import.meta.url),
  );
  return { alt: CORPUS_IMAGE_ALT, bytes };
}

/**
 * One simulated action. Sessions are reused per account, so steady running
 * logs each account in once; a rejected session is dropped and retried on a
 * later action.
 */
export function createSimulator(dependencies: SimulatorDependencies) {
  const sessions = new Map<string, ApiSession>();
  const origin = dependencies.apiOrigin;

  async function sessionFor(username: string): Promise<ApiSession> {
    const existing = sessions.get(username);
    if (existing !== undefined) {
      return existing;
    }
    const session = await logIn(
      origin,
      `${username}@example.test`,
      dependencies.password,
    );
    sessions.set(username, session);
    return session;
  }

  async function perform(
    action: PlannedAction,
    session: ApiSession,
  ): Promise<string> {
    if (action.kind === "like") {
      await likeTweet(origin, session, action.tweetId);
      await dependencies.record({
        kind: "like",
        tweetId: action.tweetId,
        userId: action.author.id,
      });
      return action.tweetId;
    }
    const tweetId = await postTweet(origin, session, {
      content: action.content,
      image: action.kind === "post" ? await pictureFor(action.image) : null,
      parentTweetId: action.kind === "reply" ? action.parentTweetId : null,
    });
    await dependencies.record({ id: tweetId, kind: "tweet" });
    return tweetId;
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
    try {
      const tweetId = await perform(action, await sessionFor(username));
      dependencies.log(
        action.kind === "like"
          ? `${username} liked a post.`
          : `${username} added a ${action.kind}.`,
      );
      return { kind: action.kind, tweetId, username };
    } catch (error) {
      if (error instanceof ActivityApiError && error.status === 401) {
        sessions.delete(username);
      }
      throw error;
    }
  };
}
