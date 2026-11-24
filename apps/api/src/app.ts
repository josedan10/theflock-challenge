import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";

import { registerErrorHandling } from "./platform/http/errors.js";

export interface BuildAppOptions {
  corsOrigin: string;
  logger?: boolean;
  readinessCheck?: () => Promise<boolean>;
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

  registerErrorHandling(app);
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
  app.get("/health/ready", async (_request, reply) => {
    const ready = (await options.readinessCheck?.()) ?? true;

    if (!ready) {
      return reply.code(503).send({ status: "unavailable" });
    }

    return { status: "ready" };
  });

  return app;
}
