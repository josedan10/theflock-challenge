import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { sessions, users } from "../../auth/infrastructure/auth.schema.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";
import { follows } from "../../social/infrastructure/social.schema.js";

import {
  createDrizzleUserSearcher,
  userSearchQuery,
} from "./drizzle-user-search.js";

import type { UserSearcher } from "../application/ports.js";

let database: TestDatabase;
let searcher: UserSearcher;
const ids = new Map<string, string>();

const members: [username: string, displayName: string][] = [
  ["ada", "Ada Lovelace"],
  ["adalbert", "Adalbert"],
  ["zed", "ADA King"],
  ["canada_fan", "Maple"],
  ["pat", "Patricia Ada"],
  ["ab_cd", "Underscore"],
  ["abxcd", "Lookalike"],
  ["percent", "100% Real"],
  ["slasher", "back\\slash"],
  ["ghost", "Ada Ghost"],
  ["bobby", "Bobby'); DROP TABLE users;--"],
  ["obrien", "O'Brien"],
];

beforeAll(async () => {
  database = await startTestDatabase();
  searcher = createDrizzleUserSearcher(database.db);
  const repository = createDrizzleUserRepository(database.db);
  for (const [username, displayName] of members) {
    const created = await repository.create(
      buildNewUser({ displayName, username }),
    );
    ids.set(username, created.id);
  }
  await database.db
    .update(users)
    .set({ deletedAt: FIXED_NOW })
    .where(eq(users.username, "ghost"));
  await database.db.insert(follows).values({
    createdAt: FIXED_NOW,
    followerId: ids.get("pat") ?? "",
    followingId: ids.get("zed") ?? "",
  });
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

const viewer = () => ids.get("pat") ?? "";

async function usernames(text: string, limit = 30): Promise<string[]> {
  const rows = await searcher.search({ limit, text, viewerId: viewer() });
  return rows.map((row) => row.username);
}

describe("user search persistence", () => {
  it("US-D01 AC-D01.2 ranks exact, username prefix, display prefix, then substrings", async () => {
    await expect(usernames("ada")).resolves.toEqual([
      "ada",
      "adalbert",
      "zed",
      "canada_fan",
      "pat",
    ]);
  });

  it("US-D01 AC-D01.1 matches display names case-insensitively", async () => {
    await expect(usernames("king")).resolves.toEqual(["zed"]);
    await expect(usernames("lovelace")).resolves.toEqual(["ada"]);
  });

  it("US-D01 AC-D01.4 treats % _ and backslash as literal characters", async () => {
    await expect(usernames("b_c")).resolves.toEqual(["ab_cd"]);
    await expect(usernames("0%")).resolves.toEqual(["percent"]);
    await expect(usernames("a%")).resolves.toEqual([]);
    await expect(usernames("k\\s")).resolves.toEqual(["slasher"]);
    await expect(usernames("__")).resolves.toEqual([]);
  });

  it("US-D01 AC-D01.3 never returns soft-deleted members and honours the cap", async () => {
    await expect(usernames("ghost")).resolves.toEqual([]);
    await expect(usernames("ada", 2)).resolves.toEqual(["ada", "adalbert"]);
  });

  it("US-D01 reports whether the viewer follows each result", async () => {
    const rows = await searcher.search({
      limit: 30,
      text: "ada",
      viewerId: viewer(),
    });

    expect(
      rows.filter((row) => row.followedByViewer).map((row) => row.username),
    ).toEqual(["zed"]);
  });

  it("SRC-01 uses the trigram indexes for substring search", async () => {
    const plan = await database.db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      const query = userSearchQuery({
        limit: 20,
        text: "lovelace",
        viewerId: viewer(),
      });
      return tx.execute<{ "QUERY PLAN": string }>(sql`explain ${query}`);
    });
    const text = plan.map((row) => row["QUERY PLAN"]).join("\n");

    expect(text).toContain("users_username_trgm_idx");
    expect(text).toContain("users_display_name_trgm_idx");
  });

  describe("user search SQL injection", () => {
    // Each payload is passed exactly as the use case would (lowercased). Bound
    // parameters keep it data: it can only match members whose names contain
    // the same characters, and it can never change, read, or drop anything.
    it.each([
      ["a tautology", "' or '1'='1", []],
      ["a quoted tautology after a name", "ada' or '1'='1", []],
      ["a comment that drops the rest", "ada' --", []],
      ["a stacked drop statement", "'; drop table users; --", []],
      [
        "a union read of credentials",
        "x' union select email, password_hash, id, true from users --",
        [],
      ],
      ["a wildcard tautology", "%' or 1=1 --", []],
      ["an escaped quote", "\\'; select pg_sleep(5); --", []],
      ["dollar quoting", "$$; drop table users; $$", []],
      [
        "a type cast escape",
        "ada'::text || (select email from users limit 1) || '",
        [],
      ],
      [
        "a stored payload, matched literally",
        "'); drop table users;--",
        ["bobby"],
      ],
      ["an apostrophe in a real name", "o'brien", ["obrien"]],
    ])("US-D01 AC-D01.4 treats %s as data", async (_case, text, expected) => {
      const before = await database.db.$count(users);

      const rows = await searcher.search({
        limit: 30,
        text,
        viewerId: viewer(),
      });

      expect(rows.map((row) => row.username)).toEqual(expected);
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual([
          "displayName",
          "followedByViewer",
          "id",
          "username",
        ]);
      }
      await expect(database.db.$count(users)).resolves.toBe(before);
      await expect(database.db.$count(sessions)).resolves.toBe(0);
    });

    it("US-D01 AC-D01.4 cannot be slowed by an injected sleep", async () => {
      const started = Date.now();

      await searcher.search({
        limit: 30,
        text: "' || pg_sleep(3) || '",
        viewerId: viewer(),
      });

      expect(Date.now() - started).toBeLessThan(2_000);
    });

    it("US-D01 AC-D01.4 rejects a malformed viewer id before any rows are read", async () => {
      await expect(
        searcher.search({
          limit: 30,
          text: "ada",
          viewerId: "x'::uuid or true --",
        }),
      ).rejects.toThrow();
    });
  });
});
