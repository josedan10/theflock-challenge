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

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, expect, it } from "vitest";

import { users } from "../../../platform/database/schema.js";
import { buildNewUser } from "../../../tests/auth-factories.js";
import {
  MIGRATIONS_FOLDER,
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";

let database: TestDatabase;

beforeAll(async () => {
  // Previous deployment: every migration before the search indexes, with
  // members already stored when the upgrade runs.
  const previous = await mkdtemp(join(tmpdir(), "pre-search-"));
  try {
    const journal = JSON.parse(
      await readFile(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
    ) as { entries: { idx: number; tag: string }[] };
    const entries = journal.entries.filter(
      (entry) => !entry.tag.endsWith("_user_search_trigram"),
    );
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
  await members.create(buildNewUser({ displayName: "Ada", username: "ada" }));
  await members.create(
    buildNewUser({ displayName: "Grace", username: "grace" }),
  );
  await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER });
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

it("SRC-01 AC-D01.1 installs pg_trgm and trigram indexes over existing members", async () => {
  const extensions = await database.db.execute<{ extname: string }>(
    sql`select extname from pg_extension where extname = 'pg_trgm'`,
  );
  expect(extensions.map((row) => row.extname)).toEqual(["pg_trgm"]);

  const indexes = await database.db.execute<{ indexdef: string }>(
    sql`select indexdef from pg_indexes
        where tablename = 'users' and indexname like 'users_%_trgm_idx'
        order by indexname`,
  );
  expect(indexes.map((row) => row.indexdef)).toEqual([
    expect.stringContaining("gin (lower((display_name)::text) gin_trgm_ops)"),
    expect.stringContaining("gin (username gin_trgm_ops)"),
  ]);

  await expect(database.db.$count(users)).resolves.toBe(2);
});
