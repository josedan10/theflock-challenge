/**
 * Formats a Date as a UTC ISO-8601 instant with six fractional digits, the
 * same precision signed keyset cursors require.
 *
 * JavaScript Dates only store milliseconds, so the last three digits are
 * zeros. Catch-up still compares in PostgreSQL against the stored
 * `timestamptz`.
 */
export function formatUtcMicroseconds(value: Date): string {
  return value.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}
