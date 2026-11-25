import {
  authSessionResponseSchema,
  createTweetResponseSchema,
  errorResponseSchema,
  notificationPageSchema,
  unreadCountResponseSchema,
} from "@twitter-clone/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";

import type { FastifyInstance } from "fastify";

const PASSWORD = "correct horse battery";
const generous = { max: 1_000, timeWindowMs: 60_000 };

let database: TestDatabase;
let app: FastifyInstance;

interface Member {
  csrfToken: string;
  token: string;
  username: string;
}

async function register(username: string): Promise<Member> {
  const response = await app.inject({
    method: "POST",
    payload: { email: `${username}@example.com`, password: PASSWORD, username },
    url: "/v1/auth/register",
  });
  expect(response.statusCode).toBe(201);
  const body = authSessionResponseSchema.parse(response.json());
  return {
    csrfToken: body.csrfToken,
    token: response.cookies.find((c) => c.name === "sid")?.value ?? "",
    username,
  };
}

const as = (member: Member, write = false) => ({
  cookies: { sid: member.token },
  headers: write ? { "x-csrf-token": member.csrfToken } : {},
});

async function act(
  member: Member,
  method: "POST" | "PUT",
  url: string,
  payload?: object,
) {
  const response = await app.inject({
    ...as(member, true),
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
  });
  expect(response.statusCode).toBeLessThan(300);
  return response;
}

const page = async (member: Member, query = "") => {
  const response = await app.inject({
    ...as(member),
    url: `/v1/notifications${query}`,
  });
  expect(response.statusCode).toBe(200);
  return notificationPageSchema.parse(response.json());
};

const unread = async (member: Member) =>
  unreadCountResponseSchema.parse(
    (
      await app.inject({
        ...as(member),
        url: "/v1/notifications/unread-count",
      })
    ).json(),
  ).unreadCount;

let ada: Member;
let grace: Member;
let adaTweet: string;

beforeAll(async () => {
  database = await startTestDatabase();
  app = await buildApp({
    auth: {
      db: database.db,
      passwordHasher: fastPasswordHasher,
      rateLimit: generous,
      sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3_600 },
      sessionSecret: "test-secret-with-at-least-32-characters",
    },
    corsOrigin: "http://localhost:3000",
    followWriteRateLimit: generous,
    likeWriteRateLimit: generous,
    notificationRateLimits: {
      count: generous,
      list: generous,
      write: generous,
    },
    tweetWriteRateLimit: generous,
  });
  ada = await register("ada");
  grace = await register("grace");
  adaTweet = createTweetResponseSchema.parse(
    (await act(ada, "POST", "/v1/tweets", { content: "Ada's tweet" })).json(),
  ).tweet.id;
  await act(grace, "PUT", "/v1/users/ada/follow");
  await act(grace, "PUT", `/v1/tweets/${adaTweet}/like`);
  await act(grace, "POST", `/v1/tweets/${adaTweet}/replies`, {
    content: "Nice one",
  });
  // Self-actions never notify.
  await act(ada, "PUT", `/v1/tweets/${adaTweet}/like`);
  await act(ada, "POST", `/v1/tweets/${adaTweet}/replies`, {
    content: "Thanks!",
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
});

describe("notifications API", () => {
  it("NOT-01 shows a member the follow, like and reply from others, newest first", async () => {
    const { items, nextCursor } = await page(ada);

    expect(items.map((item) => item.type)).toEqual(["reply", "like", "follow"]);
    expect(items.every((item) => item.actor.username === "grace")).toBe(true);
    expect(items[0]?.tweet?.content).toBe("Nice one");
    expect(items[1]?.tweet).toEqual({ content: "Ada's tweet", id: adaTweet });
    expect(items[2]?.tweet).toBeNull();
    expect(nextCursor).toBeNull();
    await expect(unread(ada)).resolves.toBe(3);
    expect((await page(grace)).items).toEqual([]);
  });

  it("NOT-01 pages with a cursor only its owner can use", async () => {
    const first = await page(ada, "?limit=2");
    const cursor = encodeURIComponent(first.nextCursor ?? "");

    expect((await page(ada, `?limit=2&cursor=${cursor}`)).items).toHaveLength(
      1,
    );
    const foreign = await app.inject({
      ...as(grace),
      url: `/v1/notifications?cursor=${cursor}`,
    });
    expect(foreign.statusCode).toBe(400);
  });

  it("NOT-01 marks read per member: another member's ids change nothing", async () => {
    const [newest] = (await page(ada)).items;
    const id = newest?.id ?? "";

    const sneaky = await act(grace, "POST", "/v1/notifications/read", {
      ids: [id],
    });
    expect(sneaky.json()).toEqual({ unreadCount: 0 });
    await expect(unread(ada)).resolves.toBe(3);

    const mine = await act(ada, "POST", "/v1/notifications/read", {
      ids: [id],
    });
    expect(mine.json()).toEqual({ unreadCount: 2 });
    expect((await page(ada)).items[0]?.read).toBe(true);

    const all = await act(ada, "POST", "/v1/notifications/read", { all: true });
    expect(all.json()).toEqual({ unreadCount: 0 });
  });

  it("NOT-01 refuses anonymous reads and cross-site writes", async () => {
    expect((await app.inject({ url: "/v1/notifications" })).statusCode).toBe(
      401,
    );
    const forged = await app.inject({
      ...as(ada),
      method: "POST",
      payload: { all: true },
      url: "/v1/notifications/read",
    });
    expect(forged.statusCode).toBe(403);
    expect(errorResponseSchema.parse(forged.json()).error.code).toBe(
      "FORBIDDEN",
    );
  });
});
