import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  errorResponseSchema,
  userSearchResponseSchema,
} from "@twitter-clone/contracts";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  AppError,
  registerErrorHandling,
} from "../../../platform/http/errors.js";

import { searchUsersRoute } from "./search-users-route.js";

import type { AuthGuard } from "../../auth/http/authentication.js";
import type { SearchUsersInput } from "../application/search-users.js";

const VIEWER_ID = "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60";

const requireSession: AuthGuard = async (request) => {
  if (request.cookies.sid !== "session-token") {
    throw new AppError("UNAUTHENTICATED", "Authentication required.");
  }
  request.auth = {
    user: { id: VIEWER_ID },
  } as unknown as NonNullable<typeof request.auth>;
};

let app: FastifyInstance;
let calls: SearchUsersInput[];

async function buildTestApp(
  options: FastifyServerOptions = { logger: false },
  searchRateLimit: { max: number; timeWindowMs: number } | "default" = {
    max: 100,
    timeWindowMs: 60_000,
  },
) {
  calls = [];
  app = Fastify(options);
  registerErrorHandling(app);
  app.decorateRequest("auth", null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(
    (instance) =>
      searchUsersRoute(instance, {
        requireSession,
        searchUsers: async (input) => {
          calls.push(input);
          return { items: [] };
        },
        ...(searchRateLimit === "default" ? {} : { searchRateLimit }),
      }),
    { prefix: "/v1" },
  );
  await app.ready();
}

afterEach(async () => {
  await app?.close();
});

const search = (query: string, signedIn = true) =>
  app.inject({
    cookies: signedIn ? { sid: "session-token" } : {},
    method: "GET",
    url: `/v1/users/search${query}`,
  });

describe("GET /v1/users/search", () => {
  it("US-D01 AC-D01.1 searches as the session member with trimmed text", async () => {
    await buildTestApp();

    const response = await search("?q=%20%20Ada%20&limit=500");

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(userSearchResponseSchema.parse(response.json())).toEqual({
      items: [],
    });
    expect(calls).toEqual([{ limit: 30, text: "Ada", viewerId: VIEWER_ID }]);
  });

  it("US-D01 AC-D01.4 passes wildcards through as text", async () => {
    await buildTestApp();

    await search(`?q=${encodeURIComponent("50%_\\")}`);

    expect(calls[0]?.text).toBe("50%_\\");
  });

  it.each([
    ["no query", "", "q"],
    ["one character", "?q=a", "q"],
    ["blank text", "?q=%20%20%20", "q"],
    ["51 characters", `?q=${"a".repeat(51)}`, "q"],
    ["a bad limit", "?q=ada&limit=-1", "limit"],
  ])(
    "US-D01 AC-D01.4 answers %s with 422 before searching",
    async (_case, query, field) => {
      await buildTestApp();

      const response = await search(query);

      expect(response.statusCode).toBe(422);
      const { error } = errorResponseSchema.parse(response.json());
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.fields).toHaveProperty(field);
      expect(calls).toHaveLength(0);
    },
  );

  it("US-D01 answers a signed-out search with 401", async () => {
    await buildTestApp();

    expect((await search("?q=ada", false)).statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("SRC-01 answers the 61st search in a minute from one client with 429 by default", async () => {
    await buildTestApp({ logger: false }, "default");

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 61; attempt += 1) {
      statuses.push((await search("?q=ada")).statusCode);
    }

    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});
