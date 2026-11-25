import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { fastPasswordHasher } from "../../src/tests/fast-password-hasher.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../src/tests/postgres.js";
import { activityCorpus } from "../activity-corpus/corpus.js";
import { seedDemo } from "../demo-data.js";

import { createSimulator } from "./simulator.js";
import { resetActivity } from "./store.js";

import type { Random } from "./plan.js";
import type { FastifyInstance } from "fastify";

const PASSWORD = "local demo password";
const generous = { max: 1000, timeWindowMs: 60_000 };

let database: TestDatabase;
let app: FastifyInstance;
let origin: string;
let storageDir: string;

beforeAll(async () => {
  database = await startTestDatabase();
  storageDir = await mkdtemp(join(tmpdir(), "activity-media-"));
  app = await buildApp({
    auth: {
      db: database.db,
      passwordHasher: fastPasswordHasher,
      rateLimit: generous,
      sessionCookie: { domain: undefined, secure: false, ttlSeconds: 3600 },
      sessionSecret: "test-secret-with-at-least-32-characters",
    },
    corsOrigin: "http://localhost:3000",
    timelineLive: { heartbeatMs: 0 },
    tweetWriteRateLimit: generous,
    uploads: { storageDir },
  });
  origin = await app.listen({ host: "127.0.0.1", port: 0 });
  await seedDemo(database.db, 10, await fastPasswordHasher.hash(PASSWORD));
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
  if (storageDir !== undefined) {
    await rm(storageDir, { force: true, recursive: true });
  }
});

/** Replays fixed draws; see plan.ts for the order they are used in. */
function draws(...values: number[]): Random {
  let index = 0;
  return () => values[index++] ?? 0;
}

function simulator(random: Random) {
  return createSimulator({
    apiOrigin: origin,
    log: () => undefined,
    password: PASSWORD,
    random,
    sql: database.sql,
  });
}

async function registerGrace(): Promise<string> {
  const registered = await app.inject({
    method: "POST",
    payload: {
      email: "grace@example.com",
      password: "correct horse battery",
      username: "grace",
    },
    url: "/v1/auth/register",
  });
  expect(registered.statusCode).toBe(201);
  const csrfToken = registered.json<{ csrfToken: string }>().csrfToken;
  const sid = registered.cookies.find((cookie) => cookie.name === "sid");
  const posted = await app.inject({
    cookies: { sid: sid?.value ?? "" },
    headers: { "x-csrf-token": csrfToken },
    method: "POST",
    payload: { content: "Anyone up for the river walk?" },
    url: "/v1/tweets",
  });
  expect(posted.statusCode).toBe(201);
  return posted.json<{ tweet: { id: string } }>().tweet.id;
}

describe("DEV-01 activity simulator", () => {
  it("posts as demo accounts through the API, reaches real members, and resets", async () => {
    const graceTweet = await registerGrace();
    const before = await database.sql<{ count: number }[]>`
      select count(*)::int as count from tweets`;

    // demo_1, no reply, first corpus post (it has a picture).
    const pictured = await simulator(draws(0, 0.9, 0))();
    expect(pictured).toMatchObject({ kind: "post", username: "demo_1" });
    const [media] = await database.sql<{ count: number }[]>`
      select count(*)::int as count from tweet_media`;
    expect(media?.count).toBe(1);

    // demo_1, no reply, the "Saving a seat" line, real member, first of them.
    const slot = activityCorpus.findIndex((line) =>
      line.text.startsWith("Saving a seat for {mention}"),
    );
    const mention = await simulator(draws(0, 0.9, (slot + 0.5) / 120, 0, 0))();
    expect(mention.kind).toBe("post");

    // demo_1 replies to the newest post it did not write: grace's.
    const reply = await simulator(draws(0, 0, 0, 0, 0))();
    expect(reply.kind).toBe("reply");
    const [parent] = await database.sql<{ parent: string }[]>`
      select parent_tweet_id as parent from tweets
      where id = ${reply.kind === "reply" ? reply.tweetId : ""}`;
    expect(parent?.parent).toBe(graceTweet);

    const received = await database.sql<{ type: string }[]>`
      select n.type from notifications n join users u on u.id = n.recipient_id
      where u.username = 'grace' order by n.type`;
    expect(received.map((row) => row.type)).toEqual(["mention", "reply"]);

    expect(await resetActivity(database.sql)).toBe(3);
    const after = await database.sql<{ count: number }[]>`
      select count(*)::int as count from tweets`;
    expect(after).toEqual(before);
    const [left] = await database.sql<{ count: number }[]>`
      select count(*)::int as count from notifications n
      join users u on u.id = n.recipient_id where u.username = 'grace'`;
    expect(left?.count).toBe(0);
  });
});
