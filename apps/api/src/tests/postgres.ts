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
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

import { createDatabase, type Database } from "../platform/database/client.js";

/** Same image as `compose.yaml` so tests exercise the production engine version. */
const POSTGRES_IMAGE = "postgres:17.7-bookworm";
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

export interface TestDatabase {
  db: Database;
  sql: Sql;
  /** Removes all rows between tests while keeping the migrated schema. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Starts a disposable PostgreSQL container and applies the real migrations,
 * so integration tests run against the same SQL that ships to production.
 */
export async function startTestDatabase(
  migrationsFolder = MIGRATIONS_FOLDER,
): Promise<TestDatabase> {
  const container: StartedTestContainer = await new GenericContainer(
    POSTGRES_IMAGE,
  )
    .withEnvironment({
      POSTGRES_DB: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_USER: "test",
    })
    .withExposedPorts(5432)
    // The entrypoint restarts the server once after init; wait for the second ready line.
    .withWaitStrategy(
      Wait.forLogMessage(/database system is ready to accept connections/, 2),
    )
    .start();

  const sql = postgres({
    database: "test",
    host: container.getHost(),
    max: 5,
    onnotice: () => undefined,
    password: "test",
    port: container.getMappedPort(5432),
    username: "test",
  });
  const db = createDatabase(sql);
  await migrate(db, { migrationsFolder });

  return {
    db,
    sql,
    async reset() {
      await sql`TRUNCATE users, sessions RESTART IDENTITY CASCADE`;
    },
    async stop() {
      await sql.end({ timeout: 5 });
      await container.stop();
    },
  };
}

/** Boots the actual journal prefix so forward migrations can be exercised with existing data. */
export async function startTestDatabaseThrough(
  lastMigrationIndex: number,
): Promise<TestDatabase> {
  const previous = await mkdtemp(join(tmpdir(), "previous-schema-"));
  try {
    const journal = JSON.parse(
      await readFile(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
    ) as { entries: { idx: number; tag: string }[] };
    const entries = journal.entries.filter((e) => e.idx <= lastMigrationIndex);
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
    return await startTestDatabase(previous);
  } finally {
    await rm(previous, { recursive: true, force: true });
  }
}
