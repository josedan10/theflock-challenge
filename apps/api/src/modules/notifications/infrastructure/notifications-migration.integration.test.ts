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

import {
  notifications,
  tweets,
  users,
} from "../../../platform/database/schema.js";
import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  MIGRATIONS_FOLDER,
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";

let database: TestDatabase;
let ada: string;
let grace: string;
const tweet = uuidv7();

beforeAll(async () => {
  // Previous release: every migration before notifications, with members and
  // a tweet already stored when the upgrade runs.
  const previous = await mkdtemp(join(tmpdir(), "pre-notifications-"));
  try {
    const journal = JSON.parse(
      await readFile(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
    ) as { entries: { idx: number; tag: string }[] };
    const notificationsAt = journal.entries.findIndex((entry) =>
      entry.tag.endsWith("_notifications"),
    );
    expect(notificationsAt).toBeGreaterThanOrEqual(0);
    // Later migrations must stay out of the previous release. Drizzle skips a
    // migration whose timestamp is older than the newest one already applied.
    const entries = journal.entries
      .slice(0, notificationsAt)
      .map((entry, idx) => ({ ...entry, idx }));
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
    await rm(previous, { force: true, recursive: true });
  }
  const members = createDrizzleUserRepository(database.db);
  ada = (await members.create(buildNewUser({ username: "ada" }))).id;
  grace = (await members.create(buildNewUser({ username: "grace" }))).id;
  await database.db.insert(tweets).values({
    authorId: ada,
    content: "before notifications",
    createdAt: FIXED_NOW,
    id: tweet,
  });
  await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER });
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

const insert = (values: Partial<typeof notifications.$inferInsert>) =>
  database.db.insert(notifications).values({
    actorId: grace,
    dedupeKey: uuidv7(),
    id: uuidv7(),
    recipientId: ada,
    tweetId: tweet,
    type: "like",
    ...values,
  });

it("NOT-01 upgrades a populated database and enforces notification rules", async () => {
  await expect(database.db.$count(users)).resolves.toBe(2);

  await insert({ dedupeKey: "like:grace:tweet" });
  await insert({
    dedupeKey: "follow:grace:ada",
    tweetId: null,
    type: "follow",
  });
  await expect(insert({ dedupeKey: "like:grace:tweet" })).rejects.toMatchObject(
    { cause: { code: "23505" } },
  );
  await expect(insert({ actorId: ada })).rejects.toMatchObject({
    cause: { code: "23514" },
  });
  await insert({ dedupeKey: "mention:tweet:ada", type: "mention" });
  await expect(insert({ type: "quote" })).rejects.toMatchObject({
    cause: { code: "23514" },
  });
  await expect(insert({ type: "follow" })).rejects.toMatchObject({
    cause: { code: "23514" },
  });
  await expect(insert({ tweetId: null })).rejects.toMatchObject({
    cause: { code: "23514" },
  });

  await database.db.delete(tweets).where(eq(tweets.id, tweet));
  const left = await database.db
    .select({ type: notifications.type })
    .from(notifications);
  expect(left).toEqual([{ type: "follow" }]);
});
