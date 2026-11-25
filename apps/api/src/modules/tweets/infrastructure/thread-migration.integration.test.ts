import { migrate } from "drizzle-orm/postgres-js/migrator";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, expect, it } from "vitest";

import { tweets, tweetDescendants } from "../../../platform/database/schema.js";
import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  MIGRATIONS_FOLDER,
  startTestDatabaseThrough,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabaseThrough(3);
}, 120_000);
afterAll(async () => {
  await database?.stop();
});

it("THR-01 upgrades a populated SRC-01 database without rewriting existing tweets or fabricating ancestors", async () => {
  const author = await createDrizzleUserRepository(database.db).create(
    buildNewUser(),
  );
  const id = uuidv7();
  await database.sql`insert into tweets(id,author_id,content,created_at) values (${id},${author.id},'Existing root',${FIXED_NOW.toISOString()})`;
  await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER });
  expect(await database.db.select().from(tweets)).toEqual([
    {
      id,
      authorId: author.id,
      content: "Existing root",
      createdAt: FIXED_NOW,
      updatedAt: null,
      parentTweetId: null,
    },
  ]);
  expect(await database.db.$count(tweetDescendants)).toBe(0);
  await database.db.insert(tweets).values({
    id: uuidv7(),
    authorId: author.id,
    content: "First reply",
    createdAt: FIXED_NOW,
    parentTweetId: id,
  });
  expect(await database.db.$count(tweetDescendants)).toBe(1);
});
