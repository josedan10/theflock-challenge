import http from "node:http";

import {
  authSessionResponseSchema,
  createTweetResponseSchema,
  errorResponseSchema,
  TIMELINE_LIVE_EVENT,
  timelineLiveEventSchema,
} from "@twitter-clone/contracts";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { follows } from "../../platform/database/schema.js";
import { FIXED_NOW } from "../../tests/auth-factories.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";
import { SESSION_COOKIE_NAME } from "../auth/http/session-cookie.js";

import { createReadTimelineSinceRows } from "./infrastructure/drizzle-timeline.js";
import { createLiveEventCursor } from "./infrastructure/signed-live-event-cursor.js";
import { createTimelineCursor } from "./infrastructure/signed-timeline-cursor.js";

import type { AuthRateLimit } from "../auth/http/rate-limit.js";
import type { FastifyInstance } from "fastify";

const SESSION_SECRET = "test-secret-with-at-least-32-characters";
const CORS_ORIGIN = "http://localhost:3000";

let database: TestDatabase;
let app: FastifyInstance;

beforeAll(async () => {
  database = await startTestDatabase();
  app = await createApp();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
});

function createApp(
  timelineStreamRateLimit?: AuthRateLimit,
): Promise<FastifyInstance> {
  return buildApp({
    auth: {
      clock: () => FIXED_NOW,
      db: database.db,
      passwordHasher: fastPasswordHasher,
      rateLimit: { max: 1000, timeWindowMs: 60_000 },
      sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3600 },
      sessionSecret: SESSION_SECRET,
    },
    corsOrigin: CORS_ORIGIN,
    followWriteRateLimit: { max: 1000, timeWindowMs: 60_000 },
    timelineLive: { heartbeatMs: 0 },
    timelineRateLimit: { max: 1000, timeWindowMs: 60_000 },
    tweetWriteRateLimit: { max: 1000, timeWindowMs: 60_000 },
    ...(timelineStreamRateLimit === undefined
      ? {}
      : { timelineStreamRateLimit }),
  });
}

async function register(instance: FastifyInstance, name: string) {
  const resp = await instance.inject({
    method: "POST",
    payload: {
      email: `${name}@example.com`,
      password: "correct horse battery",
      username: name,
    },
    url: "/v1/auth/register",
  });
  expect(resp.statusCode).toBe(201);
  const body = authSessionResponseSchema.parse(resp.json());
  return {
    csrf: body.csrfToken,
    id: body.user.id,
    token: resp.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)!
      .value,
    username: name,
  };
}

async function follow(
  instance: FastifyInstance,
  follower: { csrf: string; token: string },
  username: string,
) {
  const resp = await instance.inject({
    cookies: { [SESSION_COOKIE_NAME]: follower.token },
    headers: { "x-csrf-token": follower.csrf },
    method: "PUT",
    url: `/v1/users/${username}/follow`,
  });
  expect(resp.statusCode).toBe(200);
}

async function postTweet(
  instance: FastifyInstance,
  member: { csrf: string; token: string },
  content: string,
) {
  const resp = await instance.inject({
    cookies: { [SESSION_COOKIE_NAME]: member.token },
    headers: { "x-csrf-token": member.csrf },
    method: "POST",
    payload: { content },
    url: "/v1/tweets",
  });
  expect(resp.statusCode).toBe(201);
  return createTweetResponseSchema.parse(resp.json()).tweet;
}

async function listen(instance: FastifyInstance) {
  await instance.listen({ host: "127.0.0.1", port: 0 });
  const address = instance.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected a TCP address");
  }
  return `http://127.0.0.1:${String(address.port)}`;
}

interface OpenStream {
  request: http.ClientRequest;
  response: http.IncomingMessage;
  status: number;
}

function openStream(
  baseUrl: string,
  token: string,
  lastEventId?: string,
): Promise<OpenStream> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/v1/timeline/stream`);
    const headers: http.OutgoingHttpHeaders = {
      accept: "text/event-stream",
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      origin: CORS_ORIGIN,
    };
    if (lastEventId !== undefined) {
      headers["last-event-id"] = lastEventId;
    }
    const request = http.get(url, { headers }, (response) => {
      resolve({
        request,
        response,
        status: response.statusCode ?? 0,
      });
    });
    request.on("error", reject);
  });
}

interface LiveEvent {
  id: string;
  tweetId: string;
}

function collectEvents(
  response: http.IncomingMessage,
  count: number,
  timeoutMs = 8_000,
): Promise<LiveEvent[]> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const events: LiveEvent[] = [];
    const timeout = setTimeout(() => {
      response.destroy();
      reject(
        new Error(
          `expected ${String(count)} events, got ${String(events.length)}`,
        ),
      );
    }, timeoutMs);
    const onData = (chunk: Buffer | string) => {
      buffer += String(chunk);
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const parsed = parseSse(part);
        if (parsed === undefined) {
          continue;
        }
        events.push(parsed);
        if (events.length >= count) {
          clearTimeout(timeout);
          response.off("data", onData);
          resolve(events);
          return;
        }
      }
    };
    response.on("data", onData);
    response.on("error", (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function parseSse(block: string): LiveEvent | undefined {
  let id: string | undefined;
  let event: string | undefined;
  let data: string | undefined;
  for (const line of block.split("\n")) {
    if (line.startsWith("id:")) {
      id = line.slice(3).trim();
    } else if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data = line.slice(5).trim();
    }
  }
  if (event !== TIMELINE_LIVE_EVENT || id === undefined || data === undefined) {
    return undefined;
  }
  return {
    id,
    tweetId: timelineLiveEventSchema.parse(JSON.parse(data)).tweetId,
  };
}

describe("US-F01 live timeline stream", () => {
  it("AC-F01.4 rejects an unauthenticated stream as 401, not an open SSE body", async () => {
    const response = await app.inject({ url: "/v1/timeline/stream" });
    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "UNAUTHENTICATED",
    );
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });

  it("AC-F01.5 limits stream opens per client address and returns Retry-After", async () => {
    const limited = await createApp({ max: 2, timeWindowMs: 60_000 });
    try {
      const from = (remoteAddress: string) =>
        limited.inject({ remoteAddress, url: "/v1/timeline/stream" });
      expect((await from("192.0.2.1")).statusCode).toBe(401);
      expect((await from("192.0.2.1")).statusCode).toBe(401);
      const denied = await from("192.0.2.1");
      expect(denied.statusCode).toBe(429);
      expect(errorResponseSchema.parse(denied.json()).error.code).toBe(
        "RATE_LIMITED",
      );
      expect(Number(denied.headers["retry-after"])).toBeGreaterThan(0);
      expect((await from("192.0.2.2")).statusCode).toBe(401);
    } finally {
      await limited.close();
    }
  });

  it("AC-F01.1/2/4 streams eligible tweet ids only, with CORS and no tweet text", async () => {
    const instance = await createApp();
    const baseUrl = await listen(instance);
    try {
      const ada = await register(instance, "ada");
      const grace = await register(instance, "grace");
      const bob = await register(instance, "bob");
      await follow(instance, ada, "grace");

      const stream = await openStream(baseUrl, ada.token);
      expect(stream.status).toBe(200);
      expect(stream.response.headers["content-type"]).toMatch(
        /text\/event-stream/,
      );
      expect(stream.response.headers["cache-control"]).toBe("no-store");
      expect(stream.response.headers["access-control-allow-origin"]).toBe(
        CORS_ORIGIN,
      );
      expect(stream.response.headers["access-control-allow-credentials"]).toBe(
        "true",
      );

      const events = collectEvents(stream.response, 2);
      const followed = await postTweet(instance, grace, "hello from grace");
      const own = await postTweet(instance, ada, "hello from ada");
      const hidden = await postTweet(instance, bob, "secret from bob");
      const received = await events;
      stream.request.destroy();

      expect(received.map((event) => event.tweetId)).toEqual([
        followed.id,
        own.id,
      ]);
      expect(received.map((event) => event.tweetId)).not.toContain(hidden.id);
      for (const event of received) {
        expect(event.id.startsWith("v1.")).toBe(true);
      }
    } finally {
      await instance.close();
    }
  });

  it("AC-F01.3/4 catch-up replays missed eligible ids, skips the cursor, and ignores a tampered Last-Event-ID", async () => {
    const instance = await createApp();
    const baseUrl = await listen(instance);
    try {
      const ada = await register(instance, "ada");
      const grace = await register(instance, "grace");
      const bob = await register(instance, "bob");
      await database.db.insert(follows).values({
        followerId: ada.id,
        followingId: grace.id,
      });

      const missed = await tweetAt(grace.id, "2026-11-24T12:00:01.000000Z");
      const duplicateWindow = await tweetAt(
        grace.id,
        "2026-11-24T12:00:02.000000Z",
      );
      await tweetAt(bob.id, "2026-11-24T12:00:03.000000Z");

      const live = createLiveEventCursor(SESSION_SECRET);
      const after = live.encode(ada.id, {
        createdAt: "2026-11-24T12:00:00.000000Z",
        id: "01900000-0000-7000-8000-000000000001",
      });
      const stream = await openStream(baseUrl, ada.token, after);
      const replayed = await collectEvents(stream.response, 2);
      expect(replayed.map((event) => event.tweetId)).toEqual([
        missed,
        duplicateWindow,
      ]);
      stream.request.destroy();

      const again = await openStream(baseUrl, ada.token, replayed[1]?.id);
      const liveAfterCatchup = collectEvents(again.response, 1);
      const newer = await postTweet(instance, grace, "after reconnect");
      await expect(liveAfterCatchup).resolves.toEqual([
        expect.objectContaining({ tweetId: newer.id }),
      ]);
      again.request.destroy();

      const pages = createTimelineCursor(SESSION_SECRET);
      const pageCursor = pages.encode(ada.id, {
        createdAt: "2026-11-24T12:00:00.000000Z",
        id: missed,
      });
      const tampered = await openStream(baseUrl, ada.token, `${after}x`);
      const foreign = await openStream(baseUrl, ada.token, pageCursor);
      expect(tampered.status).toBe(200);
      expect(foreign.status).toBe(200);
      expect(tampered.response.headers["content-type"]).toMatch(
        /text\/event-stream/,
      );
      tampered.request.destroy();
      foreign.request.destroy();
    } finally {
      await instance.close();
    }
  });

  it("AC-F01.3 catch-up reads only eligible tweets newer than the cursor", async () => {
    const viewer = await register(app, "ada");
    const other = await register(app, "bob");
    const older = await tweetAt(viewer.id, "2026-11-24T11:00:00.000000Z");
    const newer = await tweetAt(viewer.id, "2026-11-24T13:00:00.000000Z");
    await tweetAt(other.id, "2026-11-24T14:00:00.000000Z");
    const read = createReadTimelineSinceRows(
      database.db,
      "http://localhost:4000",
    );
    const rows = await read(
      viewer.id,
      { createdAt: "2026-11-24T12:00:00.000000Z", id: older },
      30,
    );
    expect(rows.map((row) => row.id)).toEqual([newer]);
  });
});

async function tweetAt(authorId: string, at: string) {
  const id = uuidv7();
  await database.sql`insert into tweets(id, author_id, content, created_at) values (${id},${authorId},'hello',${at}::timestamptz)`;
  return id;
}
