import {
  authSessionResponseSchema,
  createTweetResponseSchema,
  errorResponseSchema,
  threadPageSchema,
} from "@twitter-clone/contracts";
import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import {
  likes,
  tweets,
  tweetDescendants,
  users,
} from "../../platform/database/schema.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";

import { threadQuery } from "./infrastructure/drizzle-thread-reader.js";

import type { FastifyInstance, LightMyRequestResponse } from "fastify";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const PASSWORD = "correct horse battery";

let database: TestDatabase;
let app: FastifyInstance;

beforeAll(async () => {
  database = await startTestDatabase();
  app = await buildApp({
    auth: {
      clock: () => NOW,
      db: database.db,
      passwordHasher: fastPasswordHasher,
      rateLimit: { max: 1_000, timeWindowMs: 60_000 },
      sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3_600 },
      sessionSecret: "test-secret-with-at-least-32-characters",
    },
    corsOrigin: "http://localhost:3000",
    // Rate limiting has its own route tests; this suite exercises the flow.
    tweetWriteRateLimit: { max: 1_000, timeWindowMs: 60_000 },
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
});

interface Member {
  csrfToken: string;
  token: string;
  userId: string;
}

async function registerMember(username: string): Promise<Member> {
  const response = await app.inject({
    method: "POST",
    payload: { email: `${username}@example.com`, password: PASSWORD, username },
    url: "/v1/auth/register",
  });
  expect(response.statusCode).toBe(201);
  const body = authSessionResponseSchema.parse(response.json());
  return {
    csrfToken: body.csrfToken,
    token:
      response.cookies.find((cookie) => cookie.name === "sid")?.value ?? "",
    userId: body.user.id,
  };
}

const post = (
  member: Member | null,
  content: unknown,
  csrf = member?.csrfToken,
) =>
  app.inject({
    cookies: member === null ? {} : { sid: member.token },
    headers: csrf === undefined ? {} : { "x-csrf-token": csrf },
    method: "POST",
    payload: { content } as object,
    url: "/v1/tweets",
  });

const remove = (
  member: Member | null,
  tweetId: string,
  csrf = member?.csrfToken,
) =>
  app.inject({
    cookies: member === null ? {} : { sid: member.token },
    headers: csrf === undefined ? {} : { "x-csrf-token": csrf },
    method: "DELETE",
    url: `/v1/tweets/${tweetId}`,
  });

const tweetIdOf = (response: LightMyRequestResponse) =>
  createTweetResponseSchema.parse(response.json()).tweet.id;

let ada: Member;
let grace: Member;

beforeEach(async () => {
  await database.reset();
  ada = await registerMember("ada");
  grace = await registerMember("grace");
});

describe("tweets end to end", () => {
  it("US-B01 AC-B01.1 publishes a tweet with the canonical card and stores it", async () => {
    const response = await post(ada, "  First post!  ");

    expect(response.statusCode).toBe(201);
    const { tweet } = createTweetResponseSchema.parse(response.json());
    expect(tweet).toMatchObject({
      author: {
        avatarUrl: null,
        displayName: "ada",
        id: ada.userId,
        username: "ada",
      },
      content: "First post!",
      createdAt: NOW.toISOString(),
      likeCount: 0,
      likedByViewer: false,
    });
    const [stored] = await database.db
      .select()
      .from(tweets)
      .where(eq(tweets.id, tweet.id));
    expect(stored).toMatchObject({
      authorId: ada.userId,
      content: "First post!",
    });
  });

  it("US-B01 AC-B01.2 stores nothing for empty, whitespace-only, or over-limit content", async () => {
    for (const content of ["", "   ", "a".repeat(281)]) {
      expect((await post(ada, content)).statusCode).toBe(422);
    }
    await expect(database.db.$count(tweets)).resolves.toBe(0);
  });

  it("US-B01 AC-B01.3 rejects an unauthenticated post with 401", async () => {
    const response = await post(null, "hello", undefined);

    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "UNAUTHENTICATED",
    );
    await expect(database.db.$count(tweets)).resolves.toBe(0);
  });

  it("US-A02 AC-A02.5 rejects a post with another member's CSRF token", async () => {
    const response = await post(ada, "hello", grace.csrfToken);

    expect(response.statusCode).toBe(403);
    await expect(database.db.$count(tweets)).resolves.toBe(0);
  });

  it("US-B02 AC-B02.1 lets the author delete their tweet, which is gone afterwards", async () => {
    const tweetId = tweetIdOf(await post(ada, "short-lived"));

    expect((await remove(ada, tweetId)).statusCode).toBe(204);
    await expect(database.db.$count(tweets)).resolves.toBe(0);
  });

  it("US-B02 AC-B02.2 answers another member with 403 and keeps the tweet", async () => {
    const tweetId = tweetIdOf(await post(ada, "mine"));

    const response = await remove(grace, tweetId);

    expect(response.statusCode).toBe(403);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "FORBIDDEN",
    );
    await expect(database.db.$count(tweets)).resolves.toBe(1);
  });

  it("US-B02 AC-B02.2 answers a repeat delete and an unknown tweet with 404", async () => {
    const tweetId = tweetIdOf(await post(ada, "once"));
    await remove(ada, tweetId);

    expect((await remove(ada, tweetId)).statusCode).toBe(404);
    expect(
      (await remove(ada, "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f99")).statusCode,
    ).toBe(404);
  });

  it("US-B01 AC-B01.3 rejects an unauthenticated delete with 401", async () => {
    const tweetId = tweetIdOf(await post(ada, "keep me"));

    expect((await remove(null, tweetId, undefined)).statusCode).toBe(401);
    await expect(database.db.$count(tweets)).resolves.toBe(1);
  });
});

const replyTo = (
  parent: string,
  member: Member | null,
  body: object = { content: "reply" },
  csrf = member?.csrfToken,
) =>
  app.inject({
    method: "POST",
    url: `/v1/tweets/${parent}/replies`,
    cookies: member ? { sid: member.token } : {},
    headers: csrf ? { "x-csrf-token": csrf } : {},
    payload: body,
  });
const read = (root: string, query = "", member?: Member) =>
  app.inject({
    url: `/v1/tweets/${root}/thread${query}`,
    cookies: member ? { sid: member.token } : {},
  });
async function thread(id: string, query = "", member?: Member) {
  const result = await read(id, query, member);
  expect(result.statusCode).toBe(200);
  expect(result.headers["cache-control"]).toBe("no-store");
  return threadPageSchema.parse(result.json());
}

describe("THR-01 US-B04 public threads", () => {
  it("AC-B04.1/2/3 returns bounded public pages with direct parents, stable order and real likes", async () => {
    const root = tweetIdOf(await post(ada, "root"));
    const first = tweetIdOf(
      await replyTo(root, grace, { content: "🐦".repeat(280) }),
    );
    const nested = tweetIdOf(await replyTo(first, ada));
    const sibling = tweetIdOf(await replyTo(root, grace));
    await database.db
      .insert(likes)
      .values({ tweetId: first, userId: ada.userId });
    const one = await thread(root, "?limit=1");
    expect(one.selected).toMatchObject({ id: root, parentTweetId: null });
    expect(one.items).toHaveLength(1);
    expect(one.items[0]).toMatchObject({
      id: first,
      parentTweetId: root,
      author: { id: grace.userId },
      likeCount: 1,
      likedByViewer: false,
    });
    expect((await thread(root, "?limit=1", ada)).items[0]?.likedByViewer).toBe(
      true,
    );
    const two = await thread(root, `?cursor=${one.nextCursor}`);
    expect(two.items.map((r) => r.id)).toEqual([sibling, nested]);
    expect(two.nextCursor).toBeNull();
    expect((await thread(first)).items.map((r) => r.id)).toEqual([nested]);
    expect((await read(first, `?cursor=${one.nextCursor}`)).statusCode).toBe(
      400,
    );
    expect((await read(root, `?cursor=${one.nextCursor}x`)).statusCode).toBe(
      400,
    );
  });

  it("AC-B04.2 shows a committed grandchild to a new anonymous root reader after earlier reads", async () => {
    const root = tweetIdOf(await post(ada, "Root"));
    expect((await thread(root, "", ada)).items).toEqual([]);
    const child = tweetIdOf(
      await replyTo(root, ada, { content: "First reply" }),
    );
    expect((await thread(root, "", ada)).items.map((r) => r.id)).toEqual([
      child,
    ]);
    expect((await thread(child, "", ada)).items).toEqual([]);
    const nested = tweetIdOf(
      await replyTo(child, ada, { content: "Nested reply" }),
    );
    expect((await thread(child, "", ada)).items.map((r) => r.id)).toEqual([
      nested,
    ]);
    const publicPage = await thread(root);
    expect(publicPage.items.map((r) => [r.id, r.parentTweetId])).toEqual([
      [child, root],
      [nested, child],
    ]);
    expect(publicPage.nextCursor).toBeNull();
  });

  it("AC-B04.4 only the target author may delete; deleting a branch cascades descendants and likes, not siblings", async () => {
    const root = tweetIdOf(await post(ada, "root"));
    const branch = tweetIdOf(await replyTo(root, grace));
    const deep = tweetIdOf(await replyTo(branch, ada));
    const sibling = tweetIdOf(await replyTo(root, ada));
    await database.db
      .insert(likes)
      .values({ tweetId: deep, userId: grace.userId });
    expect((await remove(ada, branch)).statusCode).toBe(403);
    expect((await remove(grace, branch)).statusCode).toBe(204);
    expect((await read(deep)).statusCode).toBe(404);
    expect(await database.db.$count(likes)).toBe(0);
    expect((await thread(root)).items.map((t) => t.id)).toEqual([sibling]);
    await replyTo(sibling, grace);
    expect((await remove(ada, root)).statusCode).toBe(204);
    expect(await database.db.$count(tweets)).toBe(0);
    expect(await database.db.$count(tweetDescendants)).toBe(0);
  });

  it("AC-B04.4 serializes a parent delete racing an insert into a grandchild", async () => {
    const root = tweetIdOf(await post(ada, "root"));
    const branch = tweetIdOf(await replyTo(root, grace));
    const deep = tweetIdOf(await replyTo(branch, ada));
    const [deleted, inserted] = await Promise.all([
      remove(ada, root),
      replyTo(deep, grace),
    ]);
    expect(deleted.statusCode).toBe(204);
    expect([201, 404]).toContain(inserted.statusCode);
    expect(await database.db.$count(tweets)).toBe(0);
    expect(await database.db.$count(tweetDescendants)).toBe(0);
  });

  it("AC-B04.6 rejects forged authors, missing parents, invalid content and unauthorized writes", async () => {
    const root = tweetIdOf(await post(ada, "root"));
    expect((await replyTo(root, null)).statusCode).toBe(401);
    expect(
      (await replyTo(root, grace, { content: "ok" }, ada.csrfToken)).statusCode,
    ).toBe(403);
    for (const body of [
      { content: "   " },
      { content: "🐦".repeat(281) },
      { content: "ok", authorId: ada.userId },
    ]) {
      expect((await replyTo(root, grace, body)).statusCode).toBe(422);
    }
    for (const missing of ["bad-id", uuidv7()]) {
      expect((await replyTo(missing, ada)).statusCode).toBe(404);
      expect((await read(missing)).statusCode).toBe(404);
    }
    await database.db
      .update(users)
      .set({ deletedAt: NOW })
      .where(eq(users.id, ada.userId));
    expect((await read(root)).statusCode).toBe(404);
    expect((await replyTo(root, grace)).statusCode).toBe(404);
    expect(await database.db.$count(tweets)).toBe(1);
  });

  it("AC-B04.6 rate limits reply writes before an additional row is created", async () => {
    const root = tweetIdOf(await post(ada, "root"));
    const limited = await buildApp({
      corsOrigin: "http://localhost:3000",
      auth: {
        clock: () => NOW,
        db: database.db,
        passwordHasher: fastPasswordHasher,
        sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3600 },
        sessionSecret: "test-secret-with-at-least-32-characters",
      },
      tweetWriteRateLimit: { max: 1, timeWindowMs: 60000 },
    });
    try {
      const send = () =>
        limited.inject({
          method: "POST",
          url: `/v1/tweets/${root}/replies`,
          cookies: { sid: grace.token },
          headers: { "x-csrf-token": grace.csrfToken },
          payload: { content: "reply" },
        });
      expect((await send()).statusCode).toBe(201);
      const rejected = await send();
      expect(rejected.statusCode).toBe(429);
      expect(rejected.headers["retry-after"]).toBeDefined();
      expect(await database.db.$count(tweets)).toBe(2);
    } finally {
      await limited.close();
    }
  });

  it("AC-B04.3/4 keeps topology immutable and uses an indexed seek for a wide thread", async () => {
    const root = tweetIdOf(await post(ada, "root"));
    const branch = tweetIdOf(await replyTo(root, grace));
    await expect(
      database.db
        .update(tweets)
        .set({ parentTweetId: branch })
        .where(eq(tweets.id, root)),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await database.sql`insert into tweets(id,author_id,parent_tweet_id,content,created_at)
      select gen_random_uuid(),${ada.userId},${root},'reply',now() + i*interval '1 second'
      from generate_series(1,2000) i`;
    await database.sql`analyze users`;
    await database.sql`analyze tweets`;
    await database.sql`analyze tweet_descendants`;
    const first = await thread(root, "?limit=100");
    expect(first.items).toHaveLength(30);
    const anchor = first.items[29]!;
    const plan = await database.db.execute(
      sql`explain (analyze,buffers,format json) ${threadQuery(root, null, anchor, 21)}`,
    );
    expect(JSON.stringify(plan)).toContain("tweet_descendants_page_idx");
  });
});
