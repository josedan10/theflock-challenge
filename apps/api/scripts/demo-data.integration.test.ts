import { afterAll, beforeAll, expect, it } from "vitest";

import { startTestDatabase, type TestDatabase } from "../src/tests/postgres.js";

import { demoCount, seedDemo } from "./demo-data.js";

let db: TestDatabase;
beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

it("SEED-01 AC-G01.1 validates the default and bounded configurable count", () => {
  expect(demoCount()).toBe(10);
  expect(demoCount("100")).toBe(100);
  for (const value of ["0", "9", "101", "NaN", "12.5", "", "-1"]) {
    expect(() => demoCount(value)).toThrow();
  }
});

it("SEED-01 AC-G01.2 populates linked demo content, grows additively and preserves existing accounts", async () => {
  await seedDemo(db.db, 10, "$argon2id$original");
  await seedDemo(db.db, 15, "$argon2id$new");
  await seedDemo(db.db, 10, "$argon2id$again");
  const [stats] = await db.sql`select (select count(*)::int from users) users,
    (select count(*)::int from tweets where parent_tweet_id is null) posts,
    (select count(*)::int from tweet_descendants) replies,
    (select count(*)::int from likes) likes, (select count(*)::int from follows) follows,
    (select count(*)::int from notifications) notifications`;
  expect(stats).toEqual({
    users: 15,
    posts: 15,
    replies: 15,
    likes: 15,
    follows: 15,
    notifications: 30,
  });
  const profiles = await db.sql<
    { username: string; display_name: string }[]
  >`select username, display_name from users where username in ('demo_1','demo_11') order by username`;
  expect(profiles).toEqual([
    { username: "demo_1", display_name: "Maya Chen" },
    { username: "demo_11", display_name: "Maya Brooks" },
  ]);
  const copy = (
    await db.sql<
      { content: string }[]
    >`select content from tweets t join users u on u.id = t.author_id where u.username like 'demo_%'`
  ).map((row) => row.content);
  expect(copy.join("\n")).not.toMatch(
    /Local Explorer|Ask me about|Anyone interested|testing out threaded replies/,
  );
  expect(
    copy.filter((content) => content.includes("south platform")),
  ).toHaveLength(2);
  expect(
    (await db.sql`select password_hash from users where username='demo_1'`)[0]
      ?.password_hash,
  ).toBe("$argon2id$original");
  await db.sql`insert into users(id,username,email,email_normalized,display_name,password_hash,created_at,updated_at)
    values(gen_random_uuid(),'demo_17','real@example.test','real@example.test','Real','$argon2id$real',now(),now())`;
  await expect(seedDemo(db.db, 17, "$argon2id$other")).rejects.toThrow();
  expect(
    await db.sql`select id from users where username='demo_16'`,
  ).toHaveLength(0);
});
