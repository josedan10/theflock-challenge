import {
  authSessionResponseSchema,
  errorResponseSchema,
  publicProfileResponseSchema,
  userSearchResponseSchema,
} from "@twitter-clone/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { tweets, users } from "../../platform/database/schema.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";

import type { FastifyInstance } from "fastify";

const PASSWORD = "correct horse battery";

let database: TestDatabase;
let app: FastifyInstance;
let viewerToken: string;

async function registerMember(
  username: string,
  displayName: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    payload: {
      displayName,
      email: `${username}@example.com`,
      password: PASSWORD,
      username,
    },
    url: "/v1/auth/register",
  });
  expect(response.statusCode).toBe(201);
  authSessionResponseSchema.parse(response.json());
  return response.cookies.find((cookie) => cookie.name === "sid")?.value ?? "";
}

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
    profileRateLimit: { search: { max: 1_000, timeWindowMs: 60_000 } },
  });
  viewerToken = await registerMember("viewer", "Viewer");
  await registerMember("ada", "Ada Lovelace");
  await registerMember("adalbert", "Adalbert");
  await registerMember("bobby", "Bobby'); DROP TABLE users;--");
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
});

const search = (query: string, token: string | null = viewerToken) =>
  app.inject({
    cookies: token === null ? {} : { sid: token },
    method: "GET",
    url: `/v1/users/search${query}`,
  });

describe("people search API", () => {
  it("US-D01 AC-D01.2 AC-D01.3 ranks results and returns public fields only", async () => {
    const response = await search("?q=ADA");

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("@example.com");
    expect(response.body).not.toContain("argon2");
    const { items } = userSearchResponseSchema.parse(response.json());
    expect(items.map((item) => item.user.username)).toEqual([
      "ada",
      "adalbert",
    ]);
    expect(items[0]?.user.displayName).toBe("Ada Lovelace");
  });

  it("US-D01 AC-D01.4 rejects short text with 422 and treats wildcards literally", async () => {
    const short = await search("?q=a");
    expect(short.statusCode).toBe(422);
    expect(errorResponseSchema.parse(short.json()).error.fields).toHaveProperty(
      "q",
    );

    const wildcard = await search(`?q=${encodeURIComponent("%%")}`);
    expect(userSearchResponseSchema.parse(wildcard.json()).items).toEqual([]);
  });

  it("US-D01 requires a session", async () => {
    expect((await search("?q=ada", null)).statusCode).toBe(401);
  });

  it("SRC-01 keeps /users/:username profiles reachable and reserves the search name", async () => {
    const profile = await app.inject({ method: "GET", url: "/v1/users/ada" });
    expect(
      publicProfileResponseSchema.parse(profile.json()).profile.username,
    ).toBe("ada");

    const reserved = await app.inject({
      method: "POST",
      payload: {
        email: "search@example.com",
        password: PASSWORD,
        username: "Search",
      },
      url: "/v1/auth/register",
    });
    expect(reserved.statusCode).toBe(422);
    expect(
      errorResponseSchema.parse(reserved.json()).error.fields,
    ).toHaveProperty("username");
  });

  describe("people search API against SQL injection", () => {
    const searchText = (text: string) =>
      search(`?q=${encodeURIComponent(text)}`);

    it.each([
      ["a tautology", "' OR '1'='1", []],
      ["a comment after a name", "ada' --", []],
      ["a stacked drop statement", "'; DROP TABLE users; --", []],
      [
        "a union read of credentials",
        "' UNION SELECT email, password_hash --",
        [],
      ],
      ["a wildcard tautology", "%' OR 1=1 --", []],
      ["a backslash-escaped quote", "\\'; SELECT 1; --", []],
      ["dollar quoting", "$$; DROP TABLE users; $$", []],
      [
        "a stored payload, matched literally",
        "'); DROP TABLE users;--",
        ["bobby"],
      ],
    ])(
      "US-D01 AC-D01.4 answers %s as a plain search",
      async (_case, text, expected) => {
        const before = await database.db.$count(users);

        const response = await searchText(text);

        expect(response.statusCode).toBe(200);
        expect(response.body).not.toContain("@example.com");
        expect(response.body).not.toContain("argon2");
        expect(
          userSearchResponseSchema
            .parse(response.json())
            .items.map((item) => item.user.username),
        ).toEqual(expected);
        await expect(database.db.$count(users)).resolves.toBe(before);
      },
    );

    it.each([
      ["a repeated q", "?q=ada&q=' OR 1=1 --"],
      ["an array-shaped q", "?q[]=ada"],
      ["an object-shaped q", "?q[$ne]=x"],
      ["an injected limit", "?q=ada&limit=1;DROP TABLE users"],
      ["a limit expression", "?q=ada&limit=1 OR 1=1"],
      ["a null byte", "?q=ada%00' OR 1=1"],
    ])(
      "US-D01 AC-D01.4 rejects %s with 422 before querying",
      async (_case, query) => {
        const response = await search(query);

        expect(response.statusCode).toBe(422);
        expect(errorResponseSchema.parse(response.json()).error.code).toBe(
          "VALIDATION_ERROR",
        );
      },
    );

    it("US-D01 AC-D01.4 leaves the schema and data intact after the attempts", async () => {
      await expect(database.db.$count(users)).resolves.toBe(4);
      await expect(database.db.$count(tweets)).resolves.toBe(0);
      const response = await searchText("ada");
      expect(
        userSearchResponseSchema
          .parse(response.json())
          .items.map((item) => item.user.username),
      ).toEqual(["ada", "adalbert"]);
    });
  });
});
