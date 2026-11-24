import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, expect, it } from "vitest";

import { follows, likes, tweets } from "../../../platform/database/schema.js";
import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  MIGRATIONS_FOLDER,
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";

let database: TestDatabase;
let follower: string;
let author: string;
const tweet = uuidv7();

beforeAll(async () => {
  // Model the actual previous deployment: same migration SQL and Drizzle journal,
  // with existing members and a tweet before the new relations are installed.
  const previous = await mkdtemp(join(tmpdir(), "pre-feed-"));
  try {
    const journal = JSON.parse(
      await readFile(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
    ) as { entries: { idx: number; tag: string }[] };
    const entries = journal.entries.filter((e) => e.idx <= 1);
    await mkdir(join(previous, "meta"));
    await writeFile(
      join(previous, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries }),
    );
    for (const { tag } of entries) {
      await copyFile(
        join(MIGRATIONS_FOLDER, `${tag}.sql`),
        join(previous, `${tag}.sql`),
      );
    }
    database = await startTestDatabase(previous);
  } finally {
    await rm(previous, { recursive: true, force: true });
  }
  const members = createDrizzleUserRepository(database.db);
  author = (await members.create(buildNewUser())).id;
  follower = (await members.create(buildNewUser())).id;
  await database.db.insert(tweets).values({
    authorId: author,
    createdAt: FIXED_NOW,
    content: "pre-migration",
    id: tweet,
  });
  await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER });
}, 120_000);
afterAll(async () => {
  await database?.stop();
});

it("FEED-01 AC-B03.1/2 upgrades populated tweets and enforces canonical social edges", async () => {
  expect(
    await database.db
      .select({ id: tweets.id, content: tweets.content })
      .from(tweets),
  ).toEqual([{ id: tweet, content: "pre-migration" }]);
  const follow = (from: string, to: string) =>
    database.db.insert(follows).values({ followerId: from, followingId: to });
  const like = (userId: string, tweetId: string) =>
    database.db.insert(likes).values({ userId, tweetId });
  await follow(follower, author);
  await like(follower, tweet);
  await expect(follow(follower, author)).rejects.toMatchObject({
    cause: { code: "23505" },
  });
  await expect(follow(author, author)).rejects.toMatchObject({
    cause: { code: "23514" },
  });
  await expect(like(follower, tweet)).rejects.toMatchObject({
    cause: { code: "23505" },
  });
  await expect(follow(uuidv7(), author)).rejects.toMatchObject({
    cause: { code: "23503" },
  });
  await expect(follow(author, uuidv7())).rejects.toMatchObject({
    cause: { code: "23503" },
  });
  await expect(like(uuidv7(), tweet)).rejects.toMatchObject({
    cause: { code: "23503" },
  });
  await expect(like(follower, uuidv7())).rejects.toMatchObject({
    cause: { code: "23503" },
  });
  await database.db.delete(tweets).where(eq(tweets.id, tweet));
  expect(await database.db.$count(likes)).toBe(0);
  expect(await database.db.$count(follows)).toBe(1);
});
