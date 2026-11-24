import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema.js";

import type { Sql } from "postgres";

export type Database = PostgresJsDatabase<typeof schema>;

/** A transaction handle, as passed to `db.transaction` callbacks. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Anything that can run queries. Repositories accept this so the same code
 * runs on the pool or inside a caller-owned transaction.
 */
export type DatabaseExecutor = Database | Transaction;

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
