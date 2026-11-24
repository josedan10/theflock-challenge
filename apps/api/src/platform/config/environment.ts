import { z } from "zod";

/** Parses `"true"`/`"false"` strictly; `z.coerce.boolean` would treat `"false"` as true. */
const booleanFlag = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const environmentSchema = z
  .object({
    API_HOST: z.string().min(1).default("0.0.0.0"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
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
    /** Absolute session lifetime; architecture sets 7 days initially. */
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(30 * 24 * 60 * 60)
      .default(7 * 24 * 60 * 60),
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
