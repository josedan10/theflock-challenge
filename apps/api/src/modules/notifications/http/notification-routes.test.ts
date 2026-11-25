import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  errorResponseSchema,
  notificationPageSchema,
  unreadCountResponseSchema,
} from "@twitter-clone/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AppError,
  registerErrorHandling,
} from "../../../platform/http/errors.js";
import { InvalidKeysetCursorError } from "../../../platform/pagination/signed-keyset-cursor.js";

import { notificationRoutes } from "./notification-routes.js";

import type { AuthGuard } from "../../auth/http/authentication.js";
import type { NotificationUseCases } from "../application/notification-use-cases.js";

const ADA = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";

const requireSession: AuthGuard = async (request) => {
  if (request.cookies.sid !== "session-token") {
    throw new AppError("UNAUTHENTICATED", "Authentication required.");
  }
  request.auth = { user: { id: ADA } } as unknown as NonNullable<
    typeof request.auth
  >;
};

const requireCsrf: AuthGuard = async (request) => {
  if (request.headers["x-csrf-token"] !== "csrf-token") {
    throw new AppError("FORBIDDEN", "A valid CSRF token is required.");
  }
};

let app: FastifyInstance;

function useCases(): NotificationUseCases {
  return {
    list: vi.fn(async (_recipient, _limit, cursor?: string) => {
      if (cursor === "stale") {
        throw new InvalidKeysetCursorError();
      }
      return { items: [], nextCursor: null };
    }),
    markRead: vi.fn(async () => 1),
    unreadCount: vi.fn(async () => 4),
  };
}

async function buildTestApp(
  notifications = useCases(),
  rateLimits?: Parameters<typeof notificationRoutes>[1]["rateLimits"],
) {
  app = Fastify({ logger: false });
  registerErrorHandling(app);
  app.decorateRequest("auth", null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(
    (instance) =>
      notificationRoutes(instance, {
        notifications,
        requireCsrf,
        requireSession,
        ...(rateLimits === undefined ? {} : { rateLimits }),
      }),
    { prefix: "/v1" },
  );
  await app.ready();
  return notifications;
}

afterEach(async () => {
  await app?.close();
});

const signedIn = { sid: "session-token" };
const csrf = { "x-csrf-token": "csrf-token" };

describe("notification routes", () => {
  it("NOT-01 lists the session member's notifications with the capped limit", async () => {
    const notifications = await buildTestApp();

    const response = await app.inject({
      cookies: signedIn,
      url: "/v1/notifications?limit=500",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(notificationPageSchema.parse(response.json())).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(notifications.list).toHaveBeenCalledWith(ADA, 30, undefined);
  });

  it.each([
    ["an invalid limit", "?limit=0"],
    ["an unknown parameter", "?sort=old"],
    ["a foreign or tampered cursor", "?cursor=stale"],
  ])("NOT-01 answers %s with 400", async (_case, query) => {
    await buildTestApp();

    const response = await app.inject({
      cookies: signedIn,
      url: `/v1/notifications${query}`,
    });

    expect(response.statusCode).toBe(400);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "MALFORMED_REQUEST",
    );
  });

  it("NOT-01 answers the unread count", async () => {
    await buildTestApp();

    const response = await app.inject({
      cookies: signedIn,
      url: "/v1/notifications/unread-count",
    });

    expect(unreadCountResponseSchema.parse(response.json())).toEqual({
      unreadCount: 4,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it.each(["/v1/notifications", "/v1/notifications/unread-count"])(
    "NOT-01 requires a session for %s",
    async (url) => {
      await buildTestApp();

      expect((await app.inject({ url })).statusCode).toBe(401);
    },
  );

  it("NOT-01 marks read with the CSRF token and answers the new count", async () => {
    const notifications = await buildTestApp();

    const response = await app.inject({
      cookies: signedIn,
      headers: csrf,
      method: "POST",
      payload: { all: true },
      url: "/v1/notifications/read",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ unreadCount: 1 });
    expect(notifications.markRead).toHaveBeenCalledWith(ADA, { all: true });
  });

  it("NOT-01 refuses mark-read without CSRF, without a session, or with a bad body", async () => {
    const notifications = await buildTestApp();
    const post = (options: object) =>
      app.inject({ method: "POST", url: "/v1/notifications/read", ...options });

    expect(
      (await post({ cookies: signedIn, payload: { all: true } })).statusCode,
    ).toBe(403);
    expect(
      (await post({ headers: csrf, payload: { all: true } })).statusCode,
    ).toBe(401);
    const invalid = await post({
      cookies: signedIn,
      headers: csrf,
      payload: { ids: ["not-a-uuid"] },
    });
    expect(invalid.statusCode).toBe(422);
    expect(notifications.markRead).not.toHaveBeenCalled();
  });

  it("NOT-01 rate limits list, count and mark-read separately", async () => {
    await buildTestApp(useCases(), {
      count: { max: 1, timeWindowMs: 60_000 },
      list: { max: 1, timeWindowMs: 60_000 },
      write: { max: 1, timeWindowMs: 60_000 },
    });
    const list = () =>
      app.inject({ cookies: signedIn, url: "/v1/notifications" });
    const count = () =>
      app.inject({ cookies: signedIn, url: "/v1/notifications/unread-count" });

    expect((await list()).statusCode).toBe(200);
    expect((await count()).statusCode).toBe(200);
    const limited = await list();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect((await count()).statusCode).toBe(429);
  });
});
