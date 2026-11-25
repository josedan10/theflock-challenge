/** Accept only simple loopback PostgreSQL URLs; query parameters must not override the host. */
export function localTarget(
  rawUrl: string | undefined,
  environment = "development",
) {
  const url = URL.parse(rawUrl ?? "");
  if (
    environment !== "development" ||
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.search ||
    !url.pathname.slice(1)
  ) {
    throw new Error("Local development database required.");
  }
  // Explicit connection options prevent libpq environment variables overriding the checked target.
  return {
    host: url.hostname === "[::1]" ? "::1" : url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    max: 1,
  };
}
