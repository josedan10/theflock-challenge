import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";

export interface BuildAppOptions {
  corsOrigin: string;
  logger?: boolean;
}

/** Creates an injectable API instance with the platform security baseline. */
export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1_048_576,
    logger: options.logger ?? false,
    requestIdHeader: "x-request-id",
  });

  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    origin(origin, callback) {
      callback(null, origin === undefined || origin === options.corsOrigin);
    },
  });

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async () => ({ status: "ready" }));

  return app;
}
