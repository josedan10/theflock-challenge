import { z } from "zod";

/** Parses `"true"`/`"false"` strictly; `z.coerce.boolean` would treat `"false"` as true. */
const booleanFlag = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

/**
 * Proxies allowed to set `X-Forwarded-For`, as a comma-separated list of
 * addresses, CIDRs, or the named ranges `loopback`, `linklocal`, `uniquelocal`
 * (for example `loopback` when Caddy runs on the same host). Unset means no
 * proxy: rate limits key on the socket address.
 *
 * Blanket `true` is refused because any client could spoof its address and
 * evade per-client rate limits. Hop counts are refused because Fastify 5
 * deliberately ignores them (they cannot validate the immediate peer).
 */
const trustProxy = z
  .string()
  .trim()
  .transform((value, context) => {
    if (value.length === 0) {
      return undefined;
    }
    if (value === "true" || value === "false" || /^\d+$/.test(value)) {
      context.addIssue({
        code: "custom",
        message:
          "Use proxy addresses, CIDRs, or named ranges, not true/false or a hop count.",
      });
      return z.NEVER;
    }
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  })
  .optional();

const environmentSchema = z
  .object({
    API_HOST: z.string().min(1).default("0.0.0.0"),
    /** Register/login attempts per client per minute; raise only for browser test runs. */
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(5),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    /** Tweet create/delete attempts per client per minute; raise only for browser test runs. */
    TWEET_RATE_LIMIT_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(20),
    COOKIE_DOMAIN: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? undefined : value))
      .optional(),
    COOKIE_SECURE: booleanFlag.default(true),
    CORS_ORIGIN: z.string().url(),
    DATABASE_URL: z.string().url().startsWith("postgresql://"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    /** HMAC key for deriving CSRF tokens; rotating it invalidates CSRF tokens. */
    SESSION_SECRET: z
      .string()
      .min(32, "SESSION_SECRET must be at least 32 characters.")
      .refine((value) => !value.startsWith("replace_me"), {
        message: "SESSION_SECRET still has the .env.example placeholder.",
      }),
    /** Absolute session lifetime; architecture sets 7 days initially. */
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(30 * 24 * 60 * 60)
      .default(7 * 24 * 60 * 60),
    TRUST_PROXY: trustProxy,
  })
  .refine(
    (environment) =>
      environment.NODE_ENV !== "production" || environment.COOKIE_SECURE,
    {
      message: "COOKIE_SECURE must be true in production.",
      path: ["COOKIE_SECURE"],
    },
  );

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Validates process configuration before the API starts accepting traffic.
 *
 * @throws {z.ZodError} When a required value is missing or unsafe.
 */
export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  return environmentSchema.parse(input);
}
