import { z } from "zod";

const environmentSchema = z.object({
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  CORS_ORIGIN: z.string().url(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Validates process configuration before the API starts accepting traffic.
 *
 * @throws {z.ZodError} When a required value is missing or unsafe.
 */
export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  return environmentSchema.parse(input);
}
