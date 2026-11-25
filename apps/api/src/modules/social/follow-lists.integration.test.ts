import {
  authSessionResponseSchema,
  errorResponseSchema,
  followListPageSchema,
  type FollowListPage,
  publicProfileResponseSchema,
} from "@twitter-clone/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";

import type { FastifyInstance } from "fastify";

const PASSWORD = "correct horse battery";

let database: TestDatabase;
let app: FastifyInstance;

beforeAll(async () => {
  database = await startTestDatabase();
  app = await buildApp({
    auth: {
      db: database.db,
      passwordHasher: fastPasswordHasher,
      rateLimit: { max: 1_000, timeWindowMs: 60_000 },
      sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3_600 },
      sessionSecret: "test-secret-with-at-least-32-characters",
    },
    corsOrigin: "http://localhost:3000",
    followListRateLimit: { max: 1_000, timeWindowMs: 60_000 },
    followWriteRateLimit: { max: 1_000, timeWindowMs: 60_000 },
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
  username: string;
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
    username,
  };
}

async function follow(member: Member, username: string): Promise<void> {
  const response = await app.inject({
    cookies: { sid: member.token },
    headers: { "x-csrf-token": member.csrfToken },
    method: "PUT",
    url: `/v1/users/${username}/follow`,
  });
  expect(response.statusCode).toBe(200);
}

const list = (
  path: string,
  viewer: Member | null = null,
  cookies: Record<string, string> = {},
) =>
  app.inject({
    cookies: viewer === null ? cookies : { sid: viewer.token },
    method: "GET",
    url: `/v1${path}`,
  });

async function readAll(
  path: string,
  viewer: Member | null,
  limit: number,
): Promise<FollowListPage["items"]> {
  const items: FollowListPage["items"] = [];
  let cursor: string | null = null;
  do {
    const query = `?limit=${limit}${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`;
    const response = await list(`${path}${query}`, viewer);
    expect(response.statusCode).toBe(200);
    const page = followListPageSchema.parse(response.json());
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return items;
}

let grace: Member;
let fans: Member[];

// Seeded once: registration hashes passwords, so per-test seeding is slow.
// Only the relationship test adds an edge (fan0 -> fan1), and no other test
// reads the lists that edge changes.
beforeAll(async () => {
  await database.reset();
  grace = await registerMember("grace");
  fans = [];
  for (let index = 0; index < 5; index += 1) {
    const fan = await registerMember(`fan${index}`);
    await follow(fan, "grace");
    fans.push(fan);
  }
}, 120_000);

describe("follow lists API", () => {
  it("US-C03 AC-C03.1 pages every follower once and agrees with the profile count", async () => {
    const followers = await readAll("/users/Grace/followers", null, 2);

    expect(followers.map((item) => item.user.username)).toEqual([
      "fan4",
      "fan3",
      "fan2",
      "fan1",
      "fan0",
    ]);
    const profile = publicProfileResponseSchema.parse(
      (await list("/users/grace")).json(),
    ).profile;
    expect(profile.followerCount).toBe(followers.length);
    expect(
      followers.every((item) => !item.followedByViewer && !item.isViewer),
    ).toBe(true);
  });

  it("US-C03 AC-C03.1 shows the signed-in viewer's relationships and own row", async () => {
    const [viewer, followed] = fans;
    if (viewer === undefined || followed === undefined) {
      throw new Error("missing fans");
    }
    await follow(viewer, followed.username);

    const followers = await readAll("/users/grace/followers", viewer, 10);

    expect(
      followers
        .filter((item) => item.followedByViewer)
        .map((item) => item.user.username),
    ).toEqual([followed.username]);
    expect(
      followers
        .filter((item) => item.isViewer)
        .map((item) => item.user.username),
    ).toEqual([viewer.username]);
  });

  it("US-C03 AC-C03.1 lists who a member follows", async () => {
    const fan = fans[4];
    if (fan === undefined) {
      throw new Error("missing fan");
    }

    await expect(
      readAll(`/users/${fan.username}/following`, grace, 10),
    ).resolves.toEqual([
      {
        followedByViewer: false,
        isViewer: true,
        user: {
          avatarUrl: null,
          displayName: "grace",
          id: grace.userId,
          username: "grace",
        },
      },
    ]);
  });

  it("US-C03 AC-C03.2 answers an empty list with no cursor", async () => {
    const response = await list("/users/grace/following");

    expect(followListPageSchema.parse(response.json())).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it("US-C03 treats a stale cookie as signed out and rejects foreign cursors", async () => {
    const stale = await list("/users/grace/followers?limit=1", null, {
      sid: "not-a-session",
    });
    expect(stale.statusCode).toBe(200);
    const page = followListPageSchema.parse(stale.json());
    const cursor = encodeURIComponent(page.nextCursor ?? "");

    const otherList = await list(`/users/grace/following?cursor=${cursor}`);
    const otherMember = await list(
      `/users/${fans[4]?.username ?? ""}/followers?cursor=${cursor}`,
    );

    for (const response of [otherList, otherMember]) {
      expect(response.statusCode).toBe(400);
      expect(errorResponseSchema.parse(response.json()).error.code).toBe(
        "MALFORMED_REQUEST",
      );
    }
    expect((await list("/users/nobody/followers")).statusCode).toBe(404);
  });
});
