import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";

import {
  type AuthModuleOptions,
  authModule,
} from "./modules/auth/auth-module.js";
import { registerErrorHandling } from "./platform/http/errors.js";

export interface BuildAppOptions {
  /** Mounts the auth routes under `/v1`; omitted only by platform-level tests. */
  auth?: AuthModuleOptions;
  corsOrigin: string;
  logger?: boolean;
  readinessCheck?: () => Promise<boolean>;
  /** Proxies allowed to set `X-Forwarded-For`; see `TRUST_PROXY`. */
  trustProxy?: string[];
}

/** Creates an injectable API instance with the platform security baseline. */
export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1_048_576,
    logger: options.logger ?? false,
    requestIdHeader: "x-request-id",
    trustProxy: options.trustProxy ?? false,
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

  await app.register(cookie);
  // Opt-in per route: only routes that declare `config.rateLimit` are limited.
  await app.register(rateLimit, { global: false });
  if (options.auth !== undefined) {
    await app.register(authModule(options.auth), { prefix: "/v1" });
  }

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
