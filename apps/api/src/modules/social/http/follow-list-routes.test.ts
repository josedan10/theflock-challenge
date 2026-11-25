import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  errorResponseSchema,
  followListPageSchema,
} from "@twitter-clone/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { registerErrorHandling } from "../../../platform/http/errors.js";
import { InvalidKeysetCursorError } from "../../../platform/pagination/signed-keyset-cursor.js";
import { FollowTargetNotFoundError } from "../domain/errors.js";

import { followListRoutes } from "./follow-list-routes.js";

import type { AuthGuard } from "../../auth/http/authentication.js";
import type { ListFollowsInput } from "../application/list-follows.js";

const VIEWER_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";

/** Treats `sid=viewer` as signed in and anything else as signed out. */
const optionalSession: AuthGuard = async (request) => {
  if (request.cookies.sid === "viewer") {
    request.auth = {
      user: { id: VIEWER_ID },
    } as unknown as NonNullable<typeof request.auth>;
  }
};

let app: FastifyInstance;
let calls: ListFollowsInput[];

async function buildTestApp(
  readRateLimit: { max: number; timeWindowMs: number } | "default" = {
    max: 100,
    timeWindowMs: 60_000,
  },
) {
  calls = [];
  app = Fastify({ logger: false });
  registerErrorHandling(app);
  app.decorateRequest("auth", null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(
    (instance) =>
      followListRoutes(instance, {
        listFollows: async (input) => {
          calls.push(input);
          if (input.username === "missing") {
            throw new FollowTargetNotFoundError();
          }
          if (input.cursor === "stale") {
            throw new InvalidKeysetCursorError();
          }
          if (input.username === "broken") {
            throw new Error("connection reset");
          }
          return { items: [], nextCursor: null };
        },
        optionalSession,
        ...(readRateLimit === "default" ? {} : { readRateLimit }),
      }),
    { prefix: "/v1" },
  );
  await app.ready();
}

afterEach(async () => {
  await app?.close();
});

const read = (url: string, cookies: Record<string, string> = {}) =>
  app.inject({ cookies, method: "GET", url: `/v1${url}` });

describe.each(["followers", "following"] as const)(
  "GET /v1/users/:username/%s",
  (direction) => {
    it("US-C03 AC-C03.1 reads a public page for a signed-out visitor", async () => {
      await buildTestApp();

      const response = await read(`/users/grace/${direction}`);

      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(followListPageSchema.parse(response.json())).toEqual({
        items: [],
        nextCursor: null,
      });
      expect(calls).toEqual([
        { direction, limit: 20, username: "grace", viewerId: null },
      ]);
    });

    it("US-C03 AC-C03.1 passes the signed-in viewer, cursor and capped limit", async () => {
      await buildTestApp();

      await read(`/users/grace/${direction}?cursor=abc&limit=500`, {
        sid: "viewer",
      });

      expect(calls).toEqual([
        {
          cursor: "abc",
          direction,
          limit: 30,
          username: "grace",
          viewerId: VIEWER_ID,
        },
      ]);
    });

    it("US-C03 answers an unknown member with 404", async () => {
      await buildTestApp();

      const response = await read(`/users/missing/${direction}`);

      expect(response.statusCode).toBe(404);
      expect(errorResponseSchema.parse(response.json()).error.code).toBe(
        "NOT_FOUND",
      );
    });

    it.each(["?limit=0", "?limit=abc", "?other=1", "?cursor="])(
      "US-C03 answers the query %s with 400 before reading",
      async (query) => {
        await buildTestApp();

        const response = await read(`/users/grace/${direction}${query}`);

        expect(response.statusCode).toBe(400);
        expect(calls).toHaveLength(0);
      },
    );

    it("US-C03 answers a cursor from another list with 400", async () => {
      await buildTestApp();

      const response = await read(`/users/grace/${direction}?cursor=stale`);

      expect(response.statusCode).toBe(400);
      expect(errorResponseSchema.parse(response.json()).error.code).toBe(
        "MALFORMED_REQUEST",
      );
    });

    it("passes unexpected failures on as a 500", async () => {
      await buildTestApp();

      expect((await read(`/users/broken/${direction}`)).statusCode).toBe(500);
    });
  },
);

describe("follow list read rate limit", () => {
  it("SOC-03 answers the 121st read in a minute from one client with 429 by default", async () => {
    await buildTestApp("default");

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 121; attempt += 1) {
      statuses.push((await read("/users/grace/followers")).statusCode);
    }

    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
  });
});
