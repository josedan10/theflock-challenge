import {
  authSessionResponseSchema,
  errorResponseSchema,
  profilePostsPageSchema,
  TIMELINE_DEFAULT_LIMIT,
  TIMELINE_MAX_LIMIT,
} from "@twitter-clone/contracts";
import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { sessions, users } from "../../platform/database/schema.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";
import { SESSION_COOKIE_NAME } from "../auth/http/session-cookie.js";

import { profilePostsQuery } from "./infrastructure/drizzle-profile-posts.js";

import type { FastifyInstance } from "fastify";

const PASSWORD = "correct horse battery";
const SECRET = "test-secret-with-at-least-32-characters";

let database: TestDatabase;
let app: FastifyInstance;

beforeAll(async () => {
  database = await startTestDatabase();
  app = await buildApp({
    auth: {
      clock: () => new Date("2026-11-24T12:00:00.000Z"),
      db: database.db,
      passwordHasher: fastPasswordHasher,
      rateLimit: { max: 1_000, timeWindowMs: 60_000 },
      sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3600 },
      sessionSecret: SECRET,
    },
    corsOrigin: "http://localhost:3000",
    mediaOrigin: "http://localhost:4000",
    profileRateLimit: {
      read: { max: 1_000, timeWindowMs: 60_000 },
    },
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
});

beforeEach(async () => {
  await database.reset();
});

async function register(username: string) {
  const response = await app.inject({
    method: "POST",
    payload: {
      displayName: username,
      email: `${username}@example.com`,
      password: PASSWORD,
      username,
    },
    url: "/v1/auth/register",
  });
  expect(response.statusCode).toBe(201);
  const body = authSessionResponseSchema.parse(response.json());
  return {
    csrfToken: body.csrfToken,
    email: `${username}@example.com`,
    id: body.user.id,
    token: response.cookies.find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    )?.value,
  };
}

const read = (username: string, query = "", token?: string) =>
  app.inject({
    cookies: token === undefined ? {} : { [SESSION_COOKIE_NAME]: token },
    url: `/v1/users/${encodeURIComponent(username)}/tweets${query}`,
  });

async function page(username: string, query = "", token?: string) {
  const response = await read(username, query, token);
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  return profilePostsPageSchema.parse(response.json());
}

async function tweet(
  authorId: string,
  content: string,
  at: string,
  parentId?: string,
) {
  const id = uuidv7();
  if (parentId === undefined) {
    await database.sql`insert into tweets(id, author_id, content, created_at)
      values (${id}, ${authorId}, ${content}, ${at}::timestamptz)`;
  } else {
    await database.sql`insert into tweets(id, author_id, parent_tweet_id, content, created_at)
      values (${id}, ${authorId}, ${parentId}, ${content}, ${at}::timestamptz)`;
  }
  return id;
}

describe("PROFILE-03 profile posts", () => {
  it("AC-A03.4 lists that member's tweets and replies newest first and hides everyone else's", async () => {
    const ada = await register("ada");
    const grace = await register("grace");
    const older = await tweet(
      ada.id,
      "older root",
      "2026-11-24T12:00:00.000000Z",
    );
    const parent = await tweet(
      grace.id,
      "grace root",
      "2026-11-24T12:00:01.000000Z",
    );
    const reply = await tweet(
      ada.id,
      "ada replies",
      "2026-11-24T12:00:02.000000Z",
      parent,
    );
    const newer = await tweet(
      ada.id,
      "newer root <script>",
      "2026-11-24T12:00:03.000000Z",
    );
    await database.sql`insert into likes(user_id, tweet_id, created_at)
      values (${grace.id}, ${newer}, now())`;
    const objectKey = uuidv7();
    await database.sql`insert into tweet_media(
      tweet_id, object_key, mime_type, byte_size, width, height, status, alt_text, created_at
    ) values (
      ${reply}, ${objectKey}::uuid, 'image/png', 12, 8, 8, 'attached', 'a diagram', now()
    )`;

    const guest = await page("Ada");
    expect(guest.items.map((item) => item.id)).toEqual([newer, reply, older]);
    expect(guest.items.map((item) => item.replyingTo)).toEqual([
      null,
      "grace",
      null,
    ]);
    expect(guest.items[0]).toMatchObject({
      content: "newer root <script>",
      likeCount: 1,
      likedByViewer: false,
      replyCount: 0,
    });
    expect(guest.items[1]?.image).toEqual({
      alt: "a diagram",
      height: 8,
      url: `http://localhost:4000/v1/media/objects/${objectKey}`,
      width: 8,
    });
    expect(JSON.stringify(guest)).not.toContain(ada.email);

    const asGrace = await page("ada", "", grace.token);
    expect(asGrace.items[0]?.likedByViewer).toBe(true);

    const gracePage = await page("grace");
    expect(gracePage.items.map((item) => item.id)).toEqual([parent]);
    expect(gracePage.items[0]?.replyCount).toBe(1);
  });

  it("AC-A03.4 drops a deleted tweet and a reply whose parent was deleted", async () => {
    const ada = await register("ada");
    const grace = await register("grace");
    const root = await tweet(ada.id, "root", "2026-11-24T12:00:00.000000Z");
    const kept = await tweet(ada.id, "kept", "2026-11-24T12:00:01.000000Z");
    await tweet(grace.id, "reply", "2026-11-24T12:00:02.000000Z", root);

    const removed = await app.inject({
      cookies: { [SESSION_COOKIE_NAME]: ada.token ?? "" },
      headers: { "x-csrf-token": ada.csrfToken },
      method: "DELETE",
      url: `/v1/tweets/${root}`,
    });
    expect(removed.statusCode).toBe(204);
    expect((await page("ada")).items.map((item) => item.id)).toEqual([kept]);
    expect((await page("grace")).items).toEqual([]);
  });

  it("AC-A03.4 keeps the next page stable when a newer post arrives and the anchor is deleted", async () => {
    const ada = await register("ada");
    const oldest = await tweet(ada.id, "oldest", "2026-11-24T12:00:00.000000Z");
    const middle = await tweet(ada.id, "middle", "2026-11-24T12:00:01.000000Z");
    const anchor = await tweet(ada.id, "anchor", "2026-11-24T12:00:02.000000Z");
    const first = await page("ada", "?limit=1");
    expect(first.items.map((item) => item.id)).toEqual([anchor]);
    await Promise.all([
      tweet(ada.id, "newer", "2026-11-24T12:00:03.000000Z"),
      database.sql`delete from tweets where id = ${anchor}`,
    ]);
    const rest = await page("ada", `?cursor=${first.nextCursor}`);
    expect(rest.items.map((item) => item.id)).toEqual([middle, oldest]);
    expect(rest.nextCursor).toBeNull();
  });

  it("AC-A03.4 orders equal timestamps by id descending", async () => {
    const ada = await register("ada");
    const low = "0190f3a4-7c2b-7000-8000-000000000001";
    const high = "0190f3a4-7c2b-7000-8000-000000000002";
    const at = "2026-11-24T12:00:00.000000Z";
    await database.sql`insert into tweets(id, author_id, content, created_at)
      values (${low}::uuid, ${ada.id}, 'low', ${at}::timestamptz),
             (${high}::uuid, ${ada.id}, 'high', ${at}::timestamptz)`;
    expect((await page("ada")).items.map((item) => item.id)).toEqual([
      high,
      low,
    ]);
  });

  it("AC-A03.4 hides the parent author after that member is deleted and ignores a stale session", async () => {
    const ada = await register("ada");
    const grace = await register("grace");
    const parent = await tweet(
      grace.id,
      "parent",
      "2026-11-24T12:00:00.000000Z",
    );
    await tweet(ada.id, "reply", "2026-11-24T12:00:01.000000Z", parent);
    await database.db
      .update(users)
      .set({ deletedAt: new Date("2026-11-24T12:00:00.000Z") })
      .where(eq(users.id, grace.id));
    await database.db
      .update(sessions)
      .set({ revokedAt: new Date("2026-11-24T12:00:00.000Z") })
      .where(eq(sessions.userId, ada.id));

    const result = await page("ada", "", ada.token);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.replyingTo).toBeNull();
    expect(result.items[0]?.likedByViewer).toBe(false);
  });

  it("AC-A03.2 uses one not-found response for unknown, impossible, and deleted usernames", async () => {
    const ada = await register("ada");
    await database.db
      .update(users)
      .set({ deletedAt: new Date("2026-11-24T12:00:00.000Z") })
      .where(eq(users.id, ada.id));

    for (const username of ["grace", "ada' OR '1'='1", "ada"]) {
      const response = await read(username);
      expect(response.statusCode).toBe(404);
      expect(errorResponseSchema.parse(response.json()).error).toMatchObject({
        code: "NOT_FOUND",
        message: "That profile does not exist.",
      });
      expect(response.body).not.toContain(ada.email);
      expect(response.body).not.toContain(ada.id);
    }
  });

  it("AC-A03.4 rejects a tampered cursor, a repeated parameter, and another profile's cursor", async () => {
    const ada = await register("ada");
    await register("grace");
    await tweet(ada.id, "one", "2026-11-24T12:00:01.000000Z");
    await tweet(ada.id, "two", "2026-11-24T12:00:00.000000Z");
    const { nextCursor } = await page("ada", "?limit=1");
    for (const query of [
      `?cursor=${nextCursor}x`,
      "?limit=1&limit=2",
      "?viewer=grace",
    ]) {
      const response = await read("ada", query);
      expect(response.statusCode).toBe(400);
      expect(errorResponseSchema.parse(response.json()).error.code).toBe(
        "MALFORMED_REQUEST",
      );
    }
    const foreign = await read("grace", `?cursor=${nextCursor}`);
    expect(foreign.statusCode).toBe(400);
    expect(errorResponseSchema.parse(foreign.json()).error.code).toBe(
      "MALFORMED_REQUEST",
    );
  });

  it("AC-A03.4 defaults to 20 and caps at 30", async () => {
    const ada = await register("ada");
    await database.sql`insert into tweets(id, author_id, content, created_at)
      select gen_random_uuid(), ${ada.id}, 'hello', now()
      from generate_series(1, ${TIMELINE_MAX_LIMIT + 1}::integer)`;
    expect((await page("ada")).items).toHaveLength(TIMELINE_DEFAULT_LIMIT);
    const capped = await page("ada", "?limit=100");
    expect(capped.items).toHaveLength(TIMELINE_MAX_LIMIT);
    expect(capped.nextCursor).not.toBeNull();
  });

  it("AC-A03.4 rate limits profile post reads per client address", async () => {
    const limited = await buildApp({
      auth: {
        db: database.db,
        passwordHasher: fastPasswordHasher,
        rateLimit: { max: 1_000, timeWindowMs: 60_000 },
        sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3600 },
        sessionSecret: SECRET,
      },
      corsOrigin: "http://localhost:3000",
      profileRateLimit: { read: { max: 2, timeWindowMs: 60_000 } },
    });
    try {
      await register("ada");
      const fetchFrom = (remoteAddress: string) =>
        limited.inject({
          remoteAddress,
          url: "/v1/users/ada/tweets",
        });
      expect((await fetchFrom("192.0.2.20")).statusCode).toBe(200);
      expect((await fetchFrom("192.0.2.20")).statusCode).toBe(200);
      const denied = await fetchFrom("192.0.2.20");
      expect(denied.statusCode).toBe(429);
      expect(errorResponseSchema.parse(denied.json()).error.code).toBe(
        "RATE_LIMITED",
      );
      expect((await fetchFrom("192.0.2.21")).statusCode).toBe(200);
    } finally {
      await limited.close();
    }
  });

  it("AC-A03.4 uses the author index, including the continuation boundary", async () => {
    const ada = await register("ada");
    const other = await register("bob");
    await database.sql`insert into tweets(id, author_id, content, created_at)
      select gen_random_uuid(), ${other.id}, 'other', now() - n * interval '1 second'
      from generate_series(1, 80) n`;
    await database.sql`insert into tweets(id, author_id, content, created_at)
      select gen_random_uuid(), ${ada.id}, 'own', now() - n * interval '1 second'
      from generate_series(1, 40) n`;
    await database.sql`analyze tweets`;
    const [anchor] = (await page("ada")).items;
    const plan = await database.db.execute(
      sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${profilePostsQuery(ada.id, null, anchor!, 21)}`,
    );
    const json = JSON.stringify(plan);
    expect(json).toContain("tweets_author_id_created_at_id_idx");
    expect(json).toMatch(/Index Cond[^}]*ROW\(created_at, id\)/);
  });
});
