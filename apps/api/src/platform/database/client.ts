import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema.js";

import type { Sql } from "postgres";

export type Database = PostgresJsDatabase<typeof schema>;

/** Wraps an existing postgres.js pool; the caller owns the pool's lifecycle. */
export function createDatabase(sql: Sql): Database {
  return drizzle(sql, { schema });
}

/** PostgreSQL SQLSTATE for `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

/**
 * Returns the violated unique constraint name, or `null` for any other error.
 * Drizzle wraps driver errors, so the driver error may be on `cause`.
 */
export function uniqueViolationConstraint(error: unknown): string | null {
  for (let current = error; current instanceof Error; current = current.cause) {
    const candidate = current as Error & {
      code?: unknown;
      constraint_name?: unknown;
    };
    if (
      candidate.code === UNIQUE_VIOLATION &&
      typeof candidate.constraint_name === "string"
    ) {
      return candidate.constraint_name;
    }
  }
  return null;
}
