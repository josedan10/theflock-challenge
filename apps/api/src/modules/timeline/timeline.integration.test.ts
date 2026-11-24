import {
  authSessionResponseSchema,
  errorResponseSchema,
  timelinePageSchema,
  TIMELINE_DEFAULT_LIMIT,
  TIMELINE_MAX_LIMIT,
} from "@twitter-clone/contracts";
import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { buildApp } from "../../app.js";
import {
  follows,
  likes,
  sessions,
  tweets,
  users,
} from "../../platform/database/schema.js";
import { FIXED_NOW } from "../../tests/auth-factories.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";
import { SESSION_COOKIE_NAME } from "../auth/http/session-cookie.js";

import { timelineQuery } from "./infrastructure/drizzle-timeline.js";

import type { AuthRateLimit } from "../auth/http/rate-limit.js";
import type { FastifyInstance } from "fastify";

let database: TestDatabase;
let app: FastifyInstance;

beforeAll(async () => {
  database = await startTestDatabase();
  app = await createApp();
}, 120_000);

function createApp(logger = false, timelineRateLimit?: AuthRateLimit) {
  return buildApp({
    logger,
    auth: {
      db: database.db,
      clock: () => FIXED_NOW,
      passwordHasher: fastPasswordHasher,
      rateLimit: { max: 1000, timeWindowMs: 60_000 },
      sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3600 },
      sessionSecret: "test-secret-with-at-least-32-characters",
    },
    corsOrigin: "http://localhost:3000",
    timelineRateLimit: timelineRateLimit ?? {
      max: 1000,
      timeWindowMs: 60_000,
    },
  });
}
afterAll(async () => {
  await app?.close();
  await database?.stop();
});
beforeEach(async () => {
  await database.reset();
});

async function register(name: string) {
  const resp = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `${name}@example.com`,
      username: name,
      password: "correct horse battery",
    },
  });
  expect(resp.statusCode).toBe(201);
  return {
    id: authSessionResponseSchema.parse(resp.json()).user.id,
    token: resp.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value,
  };
}
const get = (token?: string, query = "") =>
  app.inject({
    url: `/v1/timeline${query}`,
    cookies: token ? { [SESSION_COOKIE_NAME]: token } : {},
  });
async function page(token: string, query = "") {
  const resp = await get(token, query);
  expect(resp.statusCode).toBe(200);
  expect(resp.headers["cache-control"]).toBe("no-store");
  return timelinePageSchema.parse(resp.json());
}

async function tweet(author: string, at = "2026-11-24T12:00:00.000000Z") {
  const id = uuidv7();
  await database.sql`insert into tweets(id, author_id, content, created_at) values (${id},${author},'hello',${at}::timestamptz)`;
  return id;
}

describe("US-B03 home timeline", () => {
  it("AC-B03.1/2 returns only own and followed authors with viewer-specific likes and current follow eligibility", async () => {
    const viewer = await register("ada"),
      author = await register("grace"),
      other = await register("bob");
    const own = await tweet(viewer.id),
      followed = await tweet(author.id);
    await tweet(other.id);
    await database.db
      .insert(follows)
      .values({ followerId: other.id, followingId: viewer.id });
    expect((await page(viewer.token)).items.map((t) => t.id)).toEqual([own]);
    await database.db
      .insert(follows)
      .values({ followerId: viewer.id, followingId: author.id });
    await database.db.insert(likes).values([
      { userId: viewer.id, tweetId: followed },
      { userId: other.id, tweetId: followed },
    ]);
    const feed = await page(viewer.token);
    expect(feed.items.map((t) => t.id)).toEqual([followed, own]);
    expect(feed.items[0]).toEqual({
      id: followed,
      createdAt: "2026-11-24T12:00:00.000000Z",
      content: "hello",
      author: {
        id: author.id,
        username: "grace",
        displayName: "grace",
        avatarUrl: null,
      },
      likeCount: 2,
      likedByViewer: true,
    });
    expect((await page(author.token)).items[0]).toMatchObject({
      id: followed,
      likeCount: 2,
      likedByViewer: false,
    });
    await database.db
      .update(users)
      .set({ deletedAt: FIXED_NOW })
      .where(eq(users.id, author.id));
    expect((await page(viewer.token)).items.map((t) => t.id)).toEqual([own]);
  });

  it("AC-B03.3 preserves exact descending tuple boundaries through a newer insert and deleted anchor", async () => {
    const viewer = await register("ada");
    const oldest = await tweet(viewer.id, "2026-11-24T12:00:00.123100Z");
    const tied = await tweet(viewer.id, "2026-11-24T12:00:00.123200Z");
    const anchor = await tweet(viewer.id, "2026-11-24T12:00:00.123200Z");
    const first = await page(viewer.token, "?limit=1");
    expect(first.items.map((i) => i.id)).toEqual([anchor]);
    await Promise.all([
      tweet(viewer.id, "2026-11-24T12:00:00.123300Z"),
      database.db.delete(tweets).where(eq(tweets.id, anchor)),
    ]);
    const rest = await page(viewer.token, `?cursor=${first.nextCursor}`);
    expect(rest.items.map((i) => i.id)).toEqual([tied, oldest]);
    expect(rest.nextCursor).toBeNull();
  });

  it("AC-B03.4 requires a live session and rejects tampered, repeated or another viewer's cursor", async () => {
    const viewer = await register("ada"),
      other = await register("bob");
    expect((await get(undefined, "?cursor=invalid")).statusCode).toBe(401);
    expect((await get("unknown-session")).statusCode).toBe(401);
    expect(await page(viewer.token)).toEqual({ items: [], nextCursor: null });
    await tweet(viewer.id);
    await tweet(viewer.id);
    const { nextCursor } = await page(viewer.token, "?limit=1");
    for (const [token, query] of [
      [other.token, `?cursor=${nextCursor}`],
      [viewer.token, `?cursor=${nextCursor}x`],
      [viewer.token, "?limit=1&limit=2"],
      [viewer.token, "?viewer=bob"],
    ] as const) {
      const resp = await get(token, query);
      expect(resp.statusCode).toBe(400);
      expect(errorResponseSchema.parse(resp.json()).error.code).toBe(
        "MALFORMED_REQUEST",
      );
    }
    await database.db
      .update(sessions)
      .set({ revokedAt: FIXED_NOW })
      .where(eq(sessions.userId, viewer.id));
    expect((await get(viewer.token)).statusCode).toBe(401);
  });

  it("AC-B03.3/4 fails safely if the database cannot serve a signed continuation", async () => {
    const viewer = await register("ada");
    await tweet(viewer.id);
    const anchor = await tweet(viewer.id, "2026-11-25T01:23:45.678912Z");
    const first = await page(viewer.token, "?limit=1");
    expect(first.nextCursor).toBeTypeOf("string");
    const output = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const loggedApp = await createApp(true);
    try {
      // Simulate a missing migration only inside this suite's disposable database.
      await database.sql`ALTER TABLE likes RENAME TO temporarily_unavailable_likes`;
      try {
        const response = await loggedApp.inject({
          url: `/v1/timeline?cursor=${first.nextCursor}`,
          cookies: { [SESSION_COOKIE_NAME]: viewer.token },
        });
        expect(response.statusCode).toBe(500);
        const { error } = errorResponseSchema.parse(response.json());
        expect(error).toMatchObject({
          code: "INTERNAL_ERROR",
          message: "Something went wrong.",
        });
        const logs = output.mock.calls.map(([line]) => String(line)).join("");
        for (const sensitive of [
          viewer.id,
          viewer.token,
          anchor,
          "2026-11-25T01:23:45.678912Z",
          first.nextCursor!,
          "Failed query",
          "does not exist",
          "from likes",
        ]) {
          expect(logs).not.toContain(sensitive);
          expect(response.body).not.toContain(sensitive);
        }
        expect(logs).toContain(error.requestId);
        expect(logs).toContain('"failureKind":"database_query"');
      } finally {
        await database.sql`ALTER TABLE temporarily_unavailable_likes RENAME TO likes`;
      }
    } finally {
      await loggedApp.close();
    }
  });

  it("US-B03 limits timeline reads per client address and returns Retry-After", async () => {
    const viewer = await register("ada");
    const limited = await createApp(false, { max: 2, timeWindowMs: 60_000 });
    try {
      const fetchFrom = (remoteAddress: string) =>
        limited.inject({
          url: "/v1/timeline",
          cookies: { [SESSION_COOKIE_NAME]: viewer.token },
          remoteAddress,
        });
      expect((await fetchFrom("192.0.2.1")).statusCode).toBe(200);
      expect((await fetchFrom("192.0.2.1")).statusCode).toBe(200);
      const denied = await fetchFrom("192.0.2.1");
      expect(denied.statusCode).toBe(429);
      expect(errorResponseSchema.parse(denied.json()).error.code).toBe(
        "RATE_LIMITED",
      );
      expect(Number(denied.headers["retry-after"])).toBeGreaterThan(0);
      expect((await fetchFrom("192.0.2.2")).statusCode).toBe(200);
    } finally {
      await limited.close();
    }
  });

  it("AC-B03.4 defaults to 20 and caps at 30; exactly one full page has no cursor", async () => {
    const viewer = await register("ada");
    await database.sql`insert into tweets select gen_random_uuid(),${viewer.id},'hello',now(),null from generate_series(1, ${TIMELINE_MAX_LIMIT}::integer)`;
    expect((await page(viewer.token)).items).toHaveLength(
      TIMELINE_DEFAULT_LIMIT,
    );
    const capped = await page(viewer.token, "?limit=100");
    expect(capped.items).toHaveLength(TIMELINE_MAX_LIMIT);
    expect(capped.nextCursor).toBeNull();
  });

  it("AC-B03.2/3 uses indexed tweet reads on a sparse feed, including the continuation boundary", async () => {
    const viewer = await register("ada"),
      other = await register("bob");
    await database.sql`insert into users(id,email,email_normalized,username,display_name,password_hash,created_at,updated_at)
      select gen_random_uuid(), 'noise'||n||'@test.invalid', 'noise'||n||'@test.invalid', 'noise'||n, 'Noise', u.password_hash, now(), now()
      from users u cross join generate_series(1,200) n where u.id = ${other.id}`;
    await database.sql`insert into tweets select gen_random_uuid(),u.id,'other',now() - n * interval '1 second',null
      from users u cross join generate_series(1,100) n where u.id <> ${viewer.id}`;
    await database.sql`insert into tweets select gen_random_uuid(),${viewer.id},'own',now() - n * interval '1 second',null from generate_series(1, 100) n`;
    await database.sql`analyze tweets`;
    const [anchor] = (await page(viewer.token)).items;
    const plan = await database.db.execute(
      sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${timelineQuery(viewer.id, anchor!, 21)}`,
    );
    const json = JSON.stringify(plan);
    expect(json).toContain("tweets_author_id_created_at_id_idx");
    expect(json).toMatch(/Index Cond[^}]*ROW\(created_at, id\)/);
  });
});
